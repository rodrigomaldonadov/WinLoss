import "server-only";

import { toBetListItem } from "./bets";

import { calculateBettingStats } from "@/lib/bet-math";
import { prisma } from "@/lib/prisma";
import type { BankrollSummary } from "@/lib/types";

export async function getBankrollsForUser(
  userId: string,
): Promise<BankrollSummary[]> {
  const bankrolls = await prisma.bankroll.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: {
      bets: {
        orderBy: [{ placedAt: "desc" }, { createdAt: "desc" }],
        include: {
          bookmaker: { select: { id: true, name: true } },
          legs: {
            orderBy: { position: "asc" },
            include: {
              selections: { orderBy: { position: "asc" } },
            },
          },
        },
      },
      transactions: {
        orderBy: { occurredAt: "desc" },
        select: {
          type: true,
          amountInBankrollCurrency: true,
        },
      },
    },
  });

  return bankrolls.map((bankroll) => {
    const stats = calculateBettingStats(
      bankroll.bets,
      bankroll.initialAmount,
      bankroll.transactions,
    );

    const betListItems = bankroll.bets.map((bet) =>
      toBetListItem({
        ...bet,
        bankroll: {
          id: bankroll.id,
          name: bankroll.name,
          currency: bankroll.currency,
        },
      }),
    );

    return {
      id: bankroll.id,
      name: bankroll.name,
      currency: bankroll.currency,
      initialAmount: Number(bankroll.initialAmount),
      isActive: bankroll.isActive,
      currentBankroll: stats.currentBankroll.toNumber(),
      profit: stats.profit.toNumber(),
      turnover: stats.turnover.toNumber(),
      pendingStake: stats.pendingStake.toNumber(),
      pendingCount: stats.pendingCount,
      settledCount: stats.settledCount,
      winRate: stats.winRate.toNumber(),
      roi: stats.roi.toNumber(),
      yield: stats.yield.toNumber(),
      capitalContributed: stats.capitalContributed.toNumber(),
      ownCapital: stats.ownCapital.toNumber(),
      movementsBalance: stats.movementsBalance.toNumber(),
      bets: betListItems,
    };
  });
}

export async function getUserBankrollOptions(userId: string) {
  return prisma.bankroll.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true, currency: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function countUserBankrolls(userId: string): Promise<number> {
  return prisma.bankroll.count({ where: { userId } });
}

export type BankrollHistoryPoint = {
  date: string;
  bankroll: number;
  deposit?: number | null;
  loan?: number | null;
  payment?: number | null;
  withdrawal?: number | null;
};

export async function getBankrollHistory(
  userId: string,
  take = 180,
): Promise<BankrollHistoryPoint[]> {
  const bankroll = await prisma.bankroll.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      initialAmount: true,
      bets: {
        orderBy: [{ placedAt: "asc" }, { createdAt: "asc" }],
        take,
        select: {
          placedAt: true,
          profit: true,
          isFreeBet: true,
        },
      },
      transactions: {
        orderBy: { occurredAt: "asc" },
        select: {
          occurredAt: true,
          type: true,
          amountInBankrollCurrency: true,
        },
      },
    },
  });

  if (!bankroll) return [];

  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const days = new Map<
    string,
    {
      profit: number;
      movement: number;
      deposit: boolean;
      loan: boolean;
      payment: boolean;
      withdrawal: boolean;
    }
  >();

  const ensureDay = (date: Date) => {
    const key = dayKey(date);
    if (!days.has(key)) {
      days.set(key, {
        profit: 0,
        movement: 0,
        deposit: false,
        loan: false,
        payment: false,
        withdrawal: false,
      });
    }
    return days.get(key)!;
  };

  for (const bet of bankroll.bets) {
    const day = ensureDay(bet.placedAt);
    if (!bet.isFreeBet) {
      day.profit += Number(bet.profit ?? 0);
    }
  }

  for (const transaction of bankroll.transactions) {
    const day = ensureDay(transaction.occurredAt);
    day.movement += Number(transaction.amountInBankrollCurrency);
    if (transaction.type === "DEPOSIT") day.deposit = true;
    if (transaction.type === "LOAN_IN") day.loan = true;
    if (transaction.type === "LOAN_REPAYMENT") day.payment = true;
    if (transaction.type === "WITHDRAWAL") day.withdrawal = true;
  }

  let running =
    bankroll.initialAmount.toNumber();
  const result: BankrollHistoryPoint[] = [];

  for (const date of Array.from(days.keys()).sort()) {
    const day = days.get(date)!;
    running += day.profit + day.movement;
    result.push({
      date,
      bankroll: Math.max(0, Math.round(running * 100) / 100),
      deposit: day.deposit ? running : null,
      loan: day.loan ? running : null,
      payment: day.payment ? running : null,
      withdrawal: day.withdrawal ? running : null,
    });
  }

  return result;
}

export async function calculateDrawdown(
  userId: string,
  bankrollId?: string
): Promise<{
  currentBankroll: number;
  capitalContributed: number;
  drawdown: number;
  thresholdExceeded: boolean;
  label: string;
}> {
  // Obtener bankrolls activos usando la función ya probada
  const bankrolls = await getBankrollsForUser(userId);

  if (bankrolls.length === 0) {
    return {
      currentBankroll: 0,
      capitalContributed: 0,
      drawdown: 0,
      thresholdExceeded: false,
      label: "Sin bankrolls activos",
    };
  }

  // Usar el bankroll especificado o el primero
  const targetBankroll = bankrollId
    ? bankrolls.find((b) => b.id === bankrollId)
    : bankrolls[0];

  if (!targetBankroll) {
    return {
      currentBankroll: 0,
      capitalContributed: 0,
      drawdown: 0,
      thresholdExceeded: false,
      label: "Sin bankrolls activos",
    };
  }

  /*
   * El drawdown se mide sobre la curva de beneficio realizado, no sobre el
   * saldo: un préstamo o un pago no debe parecer una ganancia o una pérdida.
   * El denominador es el capital aportado (inicial + depósitos/préstamos −
   * retiros), no el saldo disponible.
   */
  const settledBets = await prisma.bet.findMany({
    where: {
      userId,
      bankrollId: targetBankroll.id,
      status: { not: "PENDING" },
    },
    orderBy: [{ settledAt: "asc" }, { placedAt: "asc" }],
    select: { profit: true },
  });

  let runningProfit = 0;
  let peakProfit = 0;
  for (const bet of settledBets) {
    runningProfit += Number(bet.profit ?? 0);
    peakProfit = Math.max(peakProfit, runningProfit);
  }

  const capitalContributed = targetBankroll.capitalContributed;
  const drawdown =
    capitalContributed > 0
      ? Math.max(0, (peakProfit - runningProfit) / capitalContributed)
      : 0;

  const thresholdExceeded = drawdown >= 0.15;

  const label =
    thresholdExceeded
      ? "⚠️ Drawdown alto: tu beneficio ha caído un 15% o más del capital aportado."
      : drawdown > 0
        ? `-${((drawdown) * 100).toFixed(1)}% de drawdown`
        : "Bankroll estable";

  return {
    currentBankroll: targetBankroll.currentBankroll,
    capitalContributed,
    drawdown,
    thresholdExceeded,
    label,
  };
}