"use server";

import { Prisma, type BetStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import {
  calculateBetResult,
  calculateBettingStats,
  settleBet as settleBetMath,
} from "@/lib/bet-math";
import { formatCurrency } from "@/lib/format";
import { getUserPreferences } from "@/lib/data/user";
import { zonedDateTimeToUtc } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import {
  createBetSchema,
  settleBetSchema,
  updateBetSchema,
  type BetLegInput,
} from "@/lib/validations/bet";

export type BetFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type SettleBetState = {
  ok?: boolean;
  error?: string;
};

export type DeleteBetState = {
  ok?: boolean;
  error?: string;
};

function revalidateBetViews(betId?: string) {
  revalidatePath("/");
  revalidatePath("/bets");
  revalidatePath("/bets/new");
  revalidatePath("/bankroll");
  if (betId) revalidatePath(`/bets/${betId}`);
}

type RawSelection = {
  market?: unknown;
  selection?: unknown;
  marketKey?: unknown;
  line?: unknown;
  pick?: unknown;
};

type RawLeg = {
  sport?: unknown;
  competition?: unknown;
  eventName?: unknown;
  eventDate?: unknown;
  isBuilder?: unknown;
  odds?: unknown;
  externalProvider?: unknown;
  externalEventId?: unknown;
  homeTeam?: unknown;
  awayTeam?: unknown;
  selections: Map<number, RawSelection>;
};

/**
 * Convierte FormData en la estructura anidada que valida Zod.
 *
 * Los inputs del formulario usan nombres como `legs.0.sport` y
 * `legs.0.selections.1.market`, que es lo que genera `useFieldArray`.
 */
function readBetForm(formData: FormData) {
  const rawLegs = new Map<number, RawLeg>();

  for (const [key, value] of formData.entries()) {
    const selectionMatch =
      /^legs\.(\d+)\.selections\.(\d+)\.(market|selection|marketKey|line|pick)$/.exec(
        key,
      );
    if (selectionMatch) {
      const legIndex = Number(selectionMatch[1]);
      const selectionIndex = Number(selectionMatch[2]);
      const field = selectionMatch[3] as keyof RawSelection;
      const leg: RawLeg =
        rawLegs.get(legIndex) ?? { selections: new Map() };
      const selection: RawSelection =
        leg.selections.get(selectionIndex) ?? {};
      selection[field] = value;
      leg.selections.set(selectionIndex, selection);
      rawLegs.set(legIndex, leg);
      continue;
    }

    const legMatch =
      /^legs\.(\d+)\.(sport|competition|eventName|eventDate|isBuilder|odds|externalProvider|externalEventId|homeTeam|awayTeam)$/.exec(
        key,
      );
    if (!legMatch) continue;

    const legIndex = Number(legMatch[1]);
    const field = legMatch[2] as Exclude<keyof RawLeg, "selections">;
    const leg: RawLeg = rawLegs.get(legIndex) ?? { selections: new Map() };
    leg[field] = value;
    rawLegs.set(legIndex, leg);
  }

  const legs: unknown[] = [...rawLegs.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, leg]) => ({
      sport: leg.sport,
      competition: leg.competition,
      eventName: leg.eventName,
      eventDate: leg.eventDate,
      isBuilder: leg.isBuilder ?? "false",
      odds: leg.odds,
      externalProvider: leg.externalProvider,
      externalEventId: leg.externalEventId,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      selections: [...leg.selections.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, selection]) => ({
          market: selection.market,
          selection: selection.selection,
          marketKey: selection.marketKey ?? "CUSTOM",
          line: selection.line,
          pick: selection.pick,
        })),
    }));

  // Compatibilidad con clientes antiguos que todavía envían campos planos.
  if (legs.length === 0 && formData.get("sport")) {
    legs.push({
      sport: formData.get("sport"),
      competition: formData.get("competition"),
      eventName: formData.get("eventName"),
      eventDate: undefined,
      isBuilder: "false",
      odds: formData.get("odds"),
      selections: [
        {
          market: formData.get("market"),
          selection: formData.get("selection"),
        },
      ],
    });
  }

  return {
    bankrollId: formData.get("bankrollId"),
    bookmakerId: formData.get("bookmakerId"),
    externalId: formData.get("externalId"),
    odds: formData.get("odds"),
    stake: formData.get("stake"),
    isFreeBet: formData.get("isFreeBet"),
    placedAt: formData.get("placedAt"),
    notes: formData.get("notes"),
    legs,
  };
}

function readSettlementForm(formData: FormData) {
  const rawLegs = new Map<number, { id?: unknown; status?: unknown; closingOdds?: unknown }>();

  for (const [key, value] of formData.entries()) {
    const match = /^legs\.(\d+)\.(id|status|closingOdds)$/.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    const field = match[2] as "id" | "status" | "closingOdds";
    const leg = rawLegs.get(index) ?? {};
    leg[field] = value;
    rawLegs.set(index, leg);
  }

  return {
    id: formData.get("id"),
    cashoutAmount: formData.get("cashoutAmount"),
    legs: [...rawLegs.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, leg]) => ({
        id: leg.id,
        status: leg.status,
        closingOdds: leg.closingOdds,
      })),
  };
}

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

/**
 * Valida que el bankroll y la casa pertenezcan al usuario y que el stake no
 * supere el saldo disponible. Al editar excluimos la propia apuesta del cálculo
 * para no bloquear un cambio de stake con su propio dinero pendiente.
 */
async function validateBetReferences(
  userId: string,
  data: {
    bankrollId: string;
    bookmakerId?: string;
    stake: number;
    isFreeBet: boolean;
  },
  options: { requireActiveBankroll: boolean; excludeBetId?: string },
): Promise<
  | { ok: true; bankrollId: string; currency: string }
  | { ok: false; state: BetFormState }
> {
  const bankroll = await prisma.bankroll.findFirst({
    where: {
      id: data.bankrollId,
      userId,
      ...(options.requireActiveBankroll ? { isActive: true } : {}),
    },
    include: {
      bets: {
        where: options.excludeBetId
          ? { id: { not: options.excludeBetId } }
          : undefined,
        select: {
          status: true,
          stake: true,
          odds: true,
          profit: true,
          isFreeBet: true,
        },
      },
    },
  });

  if (!bankroll) {
    return {
      ok: false,
      state: {
        fieldErrors: { bankrollId: ["Selecciona un bankroll válido."] },
      },
    };
  }

  const stats = calculateBettingStats(bankroll.bets, bankroll.initialAmount);

  if (!data.isFreeBet && data.stake > stats.currentBankroll.toNumber()) {
    return {
      ok: false,
      state: {
        fieldErrors: {
          stake: [
            `El stake supera tu saldo disponible (${formatCurrency(
              stats.currentBankroll,
              bankroll.currency,
            )}).`,
          ],
        },
      },
    };
  }

  if (data.bookmakerId) {
    const bookmaker = await prisma.bookmaker.findFirst({
      where: { id: data.bookmakerId, userId },
      select: { id: true },
    });

    if (!bookmaker) {
      return {
        ok: false,
        state: {
          fieldErrors: {
            bookmakerId: ["Selecciona una casa de apuestas válida."],
          },
        },
      };
    }
  }

  return { ok: true, bankrollId: bankroll.id, currency: bankroll.currency };
}

function legacyColumnsFromLeg(leg: BetLegInput) {
  return {
    sport: leg.sport,
    competition: leg.competition ?? null,
    eventName: leg.eventName,
    market: leg.selections[0]?.market ?? "",
    selection: leg.selections[0]?.selection ?? "",
  };
}

function betTypeFromLegCount(count: number): "SINGLE" | "COMBINED" {
  return count > 1 ? "COMBINED" : "SINGLE";
}

async function isDuplicateExternalId(error: unknown): Promise<boolean> {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createBet(
  _prevState: BetFormState,
  formData: FormData,
): Promise<BetFormState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }

  const parsed = createBetSchema.safeParse(readBetForm(formData));

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  const data = parsed.data;
  const firstLeg = data.legs[0];
  const preferences = await getUserPreferences(session.user.id);
  const placedAt = zonedDateTimeToUtc(data.placedAt, preferences.timezone);

  const references = await validateBetReferences(
    session.user.id,
    {
      bankrollId: data.bankrollId,
      bookmakerId: data.bookmakerId,
      stake: data.stake,
      isFreeBet: data.isFreeBet,
    },
    { requireActiveBankroll: true },
  );

  if (!references.ok) return references.state;

  let createdId = "";
  try {
    const created = await prisma.bet.create({
      data: {
        userId: session.user.id,
        bankrollId: references.bankrollId,
        bookmakerId: data.bookmakerId ?? null,
        externalId: data.externalId ?? null,
        ...legacyColumnsFromLeg(firstLeg),
        odds: data.odds,
        stake: data.stake,
        betType: betTypeFromLegCount(data.legs.length),
        isFreeBet: data.isFreeBet,
        placedAt,
        notes: data.notes ?? null,
        legs: {
          create: data.legs.map((leg, index) => ({
            position: index,
            sport: leg.sport,
            competition: leg.competition ?? null,
            eventName: leg.eventName,
            eventDate: leg.eventDate
              ? zonedDateTimeToUtc(leg.eventDate, preferences.timezone)
              : null,
            isBuilder: leg.isBuilder,
            odds: leg.odds,
            externalProvider: leg.externalProvider ?? null,
            externalEventId: leg.externalEventId ?? null,
            homeTeam: leg.homeTeam ?? null,
            awayTeam: leg.awayTeam ?? null,
            status: "PENDING" as const,
            selections: {
              create: leg.selections.map((selection, selectionIndex) => ({
                position: selectionIndex,
                market: selection.market,
                selection: selection.selection,
                marketKey: selection.marketKey,
                line: selection.line ?? null,
                pick: selection.pick ?? null,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });
    createdId = created.id;
  } catch (error) {
    if (await isDuplicateExternalId(error)) {
      return {
        fieldErrors: {
          externalId: ["Ya tienes un boleto registrado con ese ID."],
        },
      };
    }
    throw error;
  }

  revalidateBetViews();
  redirect(`/bets?created=${encodeURIComponent(createdId)}`);
}

/** Deshacer la última creación desde el toast post-guardado. */
export async function undoCreateBet(
  betId: string,
): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };

  const result = await prisma.bet.deleteMany({
    where: { id: betId, userId: session.user.id },
  });

  if (result.count > 0) revalidateBetViews();
  return { ok: result.count > 0 };
}

export async function updateBet(
  _prevState: BetFormState,
  formData: FormData,
): Promise<BetFormState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }

  const parsed = updateBetSchema.safeParse({
    ...readBetForm(formData),
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  const data = parsed.data;
  const preferences = await getUserPreferences(session.user.id);
  const placedAt = zonedDateTimeToUtc(data.placedAt, preferences.timezone);

  const existing = await prisma.bet.findFirst({
    where: { id: data.id, userId: session.user.id },
    select: {
      id: true,
      status: true,
      payout: true,
      isFreeBet: true,
      legs: {
        orderBy: { position: "asc" },
        select: {
          status: true,
          closingOdds: true,
          externalProvider: true,
          externalEventId: true,
          homeTeam: true,
          awayTeam: true,
          scoreHome: true,
          scoreAway: true,
          autoSettled: true,
        },
      },
    },
  });

  if (!existing) {
    return { error: "Apuesta no encontrada." };
  }

  const references = await validateBetReferences(
    session.user.id,
    {
      bankrollId: data.bankrollId,
      bookmakerId: data.bookmakerId,
      stake: data.stake,
      isFreeBet: data.isFreeBet,
    },
    {
      // Un bankroll archivado sigue siendo editable para conservar historial.
      requireActiveBankroll: false,
      excludeBetId: existing.id,
    },
  );

  if (!references.ok) return references.state;

  /*
   * Conservamos el resultado por posición al editar un boleto ya liquidado.
   * Después recalculamos el estado del boleto con las cuotas nuevas.
   */
  const legsWithStatus = data.legs.map((leg, index) => ({
    ...leg,
    eventDate: leg.eventDate
      ? zonedDateTimeToUtc(leg.eventDate, preferences.timezone)
      : null,
    status: existing.legs[index]?.status ?? ("PENDING" as const),
    closingOdds: existing.legs[index]?.closingOdds ?? null,
    externalProvider:
      leg.externalProvider ?? existing.legs[index]?.externalProvider ?? null,
    externalEventId:
      leg.externalEventId ?? existing.legs[index]?.externalEventId ?? null,
    homeTeam: leg.homeTeam ?? existing.legs[index]?.homeTeam ?? null,
    awayTeam: leg.awayTeam ?? existing.legs[index]?.awayTeam ?? null,
    scoreHome: existing.legs[index]?.scoreHome ?? null,
    scoreAway: existing.legs[index]?.scoreAway ?? null,
    autoSettled: existing.legs[index]?.autoSettled ?? false,
  }));

  let status = existing.status;
  let payout: Prisma.Decimal | null = null;
  let profit: Prisma.Decimal | null = null;

  if (existing.status === "CASHOUT") {
    const settlement = calculateBetResult({
      stake: data.stake,
      odds: data.odds,
      status: "CASHOUT",
      isFreeBet: data.isFreeBet,
      cashoutAmount: existing.payout,
    });
    payout = settlement.payout;
    profit = settlement.profit;
  } else if (existing.status !== "PENDING") {
    const settlement = settleBetMath(
      legsWithStatus.map((leg) => ({ odds: leg.odds, status: leg.status })),
      data.stake,
      data.isFreeBet,
    );
    status = settlement.status;
    if (settlement.status !== "PENDING") {
      payout = settlement.payout;
      profit = settlement.profit;
    }
  }

  const firstLeg = data.legs[0];

  try {
    await prisma.bet.update({
      where: { id: existing.id },
      data: {
        bankrollId: references.bankrollId,
        bookmakerId: data.bookmakerId ?? null,
        externalId: data.externalId ?? null,
        ...legacyColumnsFromLeg(firstLeg),
        odds: data.odds,
        stake: data.stake,
        betType: betTypeFromLegCount(data.legs.length),
        isFreeBet: data.isFreeBet,
        placedAt,
        notes: data.notes ?? null,
        status,
        payout,
        profit,
        settledAt:
          status === "PENDING" ? null : new Date(),
        legs: {
          deleteMany: {},
          create: legsWithStatus.map((leg, index) => ({
            position: index,
            sport: leg.sport,
            competition: leg.competition ?? null,
            eventName: leg.eventName,
            eventDate: leg.eventDate ?? null,
            isBuilder: leg.isBuilder,
            odds: leg.odds,
            closingOdds: leg.closingOdds,
            status: leg.status,
            externalProvider: leg.externalProvider,
            externalEventId: leg.externalEventId,
            homeTeam: leg.homeTeam,
            awayTeam: leg.awayTeam,
            scoreHome: leg.scoreHome,
            scoreAway: leg.scoreAway,
            autoSettled: leg.autoSettled,
            selections: {
              create: leg.selections.map((selection, selectionIndex) => ({
                position: selectionIndex,
                market: selection.market,
                selection: selection.selection,
                marketKey: selection.marketKey,
                line: selection.line ?? null,
                pick: selection.pick ?? null,
              })),
            },
          })),
        },
      },
    });
  } catch (error) {
    if (await isDuplicateExternalId(error)) {
      return {
        fieldErrors: {
          externalId: ["Ya tienes un boleto registrado con ese ID."],
        },
      };
    }
    throw error;
  }

  revalidateBetViews(existing.id);
  revalidatePath(`/bets/${existing.id}/edit`);
  redirect("/bets");
}

export async function deleteBet(
  _prevState: DeleteBetState,
  formData: FormData,
): Promise<DeleteBetState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }

  const parsedId = z.string().min(1).safeParse(formData.get("id"));
  if (!parsedId.success) {
    return { error: "Apuesta no válida." };
  }

  const deleted = await prisma.bet.deleteMany({
    where: { id: parsedId.data, userId: session.user.id },
  });

  if (deleted.count === 0) {
    return { error: "Apuesta no encontrada." };
  }

  revalidateBetViews(parsedId.data);
  return { ok: true };
}

export async function settleBet(
  _prevState: SettleBetState,
  formData: FormData,
): Promise<SettleBetState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }

  const parsed = settleBetSchema.safeParse(readSettlementForm(formData));

  if (!parsed.success) {
    return { error: "Revisa el resultado de la apuesta." };
  }

  const data = parsed.data;

  const bet = await prisma.bet.findFirst({
    where: { id: data.id, userId: session.user.id },
    select: {
      id: true,
      status: true,
      stake: true,
      odds: true,
      isFreeBet: true,
      legs: {
        orderBy: { position: "asc" },
        select: { id: true, odds: true, status: true, closingOdds: true },
      },
    },
  });

  if (!bet) {
    return { error: "Apuesta no encontrada." };
  }

  if (bet.status !== "PENDING") {
    return { error: "Esta apuesta ya está liquidada." };
  }

  const legIds = new Set(bet.legs.map((leg) => leg.id));
  if (data.legs.some((leg) => !legIds.has(leg.id))) {
    return { error: "El resultado incluye un partido que no pertenece al boleto." };
  }

  const submitted = new Map(data.legs.map((leg) => [leg.id, leg]));
  const updatedLegs = bet.legs.map((leg) => {
    const next = submitted.get(leg.id);
    return {
      ...leg,
      status: next?.status ?? leg.status,
      closingOdds:
        next?.closingOdds !== undefined ? next.closingOdds : leg.closingOdds,
    };
  });

  let status: BetStatus;
  let payout: Prisma.Decimal;
  let profit: Prisma.Decimal;
  let settledAt: Date | null;

  if (data.cashoutAmount !== undefined) {
    const result = calculateBetResult({
      stake: bet.stake,
      odds: bet.odds,
      status: "CASHOUT",
      isFreeBet: bet.isFreeBet,
      cashoutAmount: data.cashoutAmount,
    });
    status = "CASHOUT";
    payout = result.payout;
    profit = result.profit;
    settledAt = new Date();
  } else {
    const result = settleBetMath(
      updatedLegs.map((leg) => ({ odds: leg.odds, status: leg.status })),
      bet.stake,
      bet.isFreeBet,
    );
    status = result.status;
    payout = result.payout;
    profit = result.profit;
    settledAt = result.status === "PENDING" ? null : new Date();
  }

  await prisma.$transaction(async (tx) => {
    for (const leg of updatedLegs) {
      await tx.betLeg.update({
        where: { id: leg.id },
        data: {
          status: leg.status,
          closingOdds: leg.closingOdds,
          autoSettled: false,
        },
      });
    }

    await tx.bet.update({
      where: { id: bet.id },
      data: {
        status,
        settledAt,
        payout: status === "PENDING" ? null : payout,
        profit: status === "PENDING" ? null : profit,
      },
    });
  });

  revalidateBetViews(bet.id);
  return { ok: true };
}
