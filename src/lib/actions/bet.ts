"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { calculateBetResult, calculateBettingStats } from "@/lib/bet-math";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  createBetSchema,
  settleBetSchema,
  updateBetSchema,
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

function revalidateBetViews() {
  revalidatePath("/");
  revalidatePath("/bets");
  revalidatePath("/bets/new");
  revalidatePath("/bankroll");
}

function readBetForm(formData: FormData) {
  return {
    bankrollId: formData.get("bankrollId"),
    bookmakerId: formData.get("bookmakerId"),
    sport: formData.get("sport"),
    competition: formData.get("competition"),
    eventName: formData.get("eventName"),
    market: formData.get("market"),
    selection: formData.get("selection"),
    odds: formData.get("odds"),
    stake: formData.get("stake"),
    betType: formData.get("betType") || "SINGLE",
    isFreeBet: formData.get("isFreeBet"),
    placedAt: formData.get("placedAt"),
    notes: formData.get("notes"),
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

  if (data.odds < 1.01) {
    return { fieldErrors: { odds: ["La cuota debe ser mayor que 1.00."] } };
  }

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

  await prisma.bet.create({
    data: {
      userId: session.user.id,
      bankrollId: references.bankrollId,
      bookmakerId: data.bookmakerId ?? null,
      sport: data.sport,
      competition: data.competition ?? null,
      eventName: data.eventName,
      market: data.market,
      selection: data.selection,
      odds: data.odds,
      stake: data.stake,
      betType: data.betType,
      isFreeBet: data.isFreeBet,
      placedAt: data.placedAt,
      notes: data.notes ?? null,
    },
  });

  revalidateBetViews();
  redirect("/bets");
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

  const existing = await prisma.bet.findFirst({
    where: { id: data.id, userId: session.user.id },
    select: {
      id: true,
      status: true,
      payout: true,
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
   * Si la apuesta ya estaba liquidada conservamos su resultado y recalculamos
   * payout/profit con la nueva cuota o stake. Para CASHOUT el importe devuelto
   * es el propio payout guardado, no el beneficio.
   */
  const settlement =
    existing.status === "PENDING"
      ? null
      : calculateBetResult({
          stake: data.stake,
          odds: data.odds,
          status: existing.status,
          isFreeBet: data.isFreeBet,
          cashoutAmount:
            existing.status === "CASHOUT" && existing.payout !== null
              ? existing.payout.toString()
              : undefined,
        });

  const updated = await prisma.bet.updateMany({
    where: { id: existing.id, userId: session.user.id },
    data: {
      bankrollId: references.bankrollId,
      bookmakerId: data.bookmakerId ?? null,
      sport: data.sport,
      competition: data.competition ?? null,
      eventName: data.eventName,
      market: data.market,
      selection: data.selection,
      odds: data.odds,
      stake: data.stake,
      betType: data.betType,
      isFreeBet: data.isFreeBet,
      placedAt: data.placedAt,
      notes: data.notes ?? null,
      payout: settlement?.payout ?? null,
      profit: settlement?.profit ?? null,
    },
  });

  if (updated.count === 0) {
    return { error: "No pudimos actualizar la apuesta." };
  }

  revalidateBetViews();
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

  revalidateBetViews();
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

  const parsed = settleBetSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    cashoutAmount: formData.get("cashoutAmount"),
  });

  if (!parsed.success) {
    return { error: "Revisa el resultado de la apuesta." };
  }

  const bet = await prisma.bet.findFirst({
    where: { id: parsed.data.id, userId: session.user.id },
    select: {
      id: true,
      status: true,
      stake: true,
      odds: true,
      isFreeBet: true,
    },
  });

  if (!bet) {
    return { error: "Apuesta no encontrada." };
  }

  if (bet.status !== "PENDING") {
    return { error: "Esta apuesta ya está liquidada." };
  }

  const result = calculateBetResult({
    stake: bet.stake,
    odds: bet.odds,
    status: parsed.data.status,
    isFreeBet: bet.isFreeBet,
    cashoutAmount: parsed.data.cashoutAmount,
  });

  const updated = await prisma.bet.updateMany({
    where: { id: bet.id, userId: session.user.id },
    data: {
      status: parsed.data.status,
      settledAt: new Date(),
      payout: result.payout,
      profit: result.profit,
    },
  });

  if (updated.count === 0) {
    return { error: "No pudimos liquidar la apuesta." };
  }

  revalidateBetViews();
  return { ok: true };
}
