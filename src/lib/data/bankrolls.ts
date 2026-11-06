import "server-only";

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

  return bankrolls.map((bankroll) => {
    const stats = calculateBettingStats(bankroll.bets, bankroll.initialAmount);

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
