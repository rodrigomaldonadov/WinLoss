"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { calculateBetResult, calculateBettingStats } from "@/lib/bet-math";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { createBetSchema, settleBetSchema } from "@/lib/validations/bet";

export type BetFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type SettleBetState = {
  ok?: boolean;
  error?: string;
};

function revalidateBetViews() {
  revalidatePath("/");
  revalidatePath("/bets");
  revalidatePath("/bets/new");
  revalidatePath("/bankroll");
}

export async function createBet(
  _prevState: BetFormState,
  formData: FormData,
): Promise<BetFormState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
  }

  const parsed = createBetSchema.safeParse({
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
  });

  if (!parsed.success) {
    return {
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const data = parsed.data;

  const bankroll = await prisma.bankroll.findFirst({
    where: { id: data.bankrollId, userId: session.user.id, isActive: true },
    include: {
      bets: {
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
      fieldErrors: { bankrollId: ["Selecciona un bankroll válido."] },
    };
  }

  if (data.odds < 1.01) {
    return { fieldErrors: { odds: ["La cuota debe ser mayor que 1.00."] } };
  }

  const stats = calculateBettingStats(bankroll.bets, bankroll.initialAmount);

  if (!data.isFreeBet && data.stake > stats.currentBankroll.toNumber()) {
    return {
      fieldErrors: {
        stake: [
          `El stake supera tu saldo disponible (${formatCurrency(
            stats.currentBankroll,
            bankroll.currency,
          )}).`,
        ],
      },
    };
  }

  if (data.bookmakerId) {
    const bookmaker = await prisma.bookmaker.findFirst({
      where: { id: data.bookmakerId, userId: session.user.id },
      select: { id: true },
    });

    if (!bookmaker) {
      return {
        fieldErrors: { bookmakerId: ["Selecciona una casa de apuestas válida."] },
      };
    }
  }

  await prisma.bet.create({
    data: {
      userId: session.user.id,
      bankrollId: bankroll.id,
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
