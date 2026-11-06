import "server-only";

import type { BetStatus, BetType } from "@prisma/client";

import { calculateBettingStats } from "@/lib/bet-math";
import { prisma } from "@/lib/prisma";

export type BetFilter = "pending" | "settled" | "all";

export type BetListItem = {
  id: string;
  sport: string;
  competition: string | null;
  eventName: string;
  market: string;
  selection: string;
  odds: number;
  stake: number;
  status: BetStatus;
  betType: BetType;
  isFreeBet: boolean;
  placedAt: Date;
  settledAt: Date | null;
  payout: number | null;
  profit: number | null;
  bankroll: { id: string; name: string; currency: string };
  bookmaker: { id: string; name: string } | null;
};

export async function getBetsForUser(
  userId: string,
  filter: BetFilter = "all",
  take = 100,
): Promise<BetListItem[]> {
  const bets = await prisma.bet.findMany({
    where: {
      userId,
      ...(filter === "pending"
        ? { status: "PENDING" }
        : filter === "settled"
          ? { status: { not: "PENDING" } }
          : {}),
    },
    orderBy: [{ placedAt: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      bankroll: { select: { id: true, name: true, currency: true } },
      bookmaker: { select: { id: true, name: true } },
    },
  });

  return bets.map((bet) => ({
    id: bet.id,
    sport: bet.sport,
    competition: bet.competition,
    eventName: bet.eventName,
    market: bet.market,
    selection: bet.selection,
    odds: Number(bet.odds),
    stake: Number(bet.stake),
    status: bet.status,
    betType: bet.betType,
    isFreeBet: bet.isFreeBet,
    placedAt: bet.placedAt,
    settledAt: bet.settledAt,
    payout: bet.payout === null ? null : Number(bet.payout),
    profit: bet.profit === null ? null : Number(bet.profit),
    bankroll: bet.bankroll,
    bookmaker: bet.bookmaker,
  }));
}

export async function getRecentBets(userId: string, take = 5) {
  return getBetsForUser(userId, "all", take);
}

export async function getBetCounts(userId: string) {
  const bets = await prisma.bet.findMany({
    where: { userId },
    select: { status: true, stake: true, odds: true, profit: true, isFreeBet: true },
  });

  const stats = calculateBettingStats(bets);

  return {
    pendingCount: stats.pendingCount,
    settledCount: stats.settledCount,
    wonCount: stats.wonCount,
    lostCount: stats.lostCount,
    profit: stats.profit.toNumber(),
    pendingStake: stats.pendingStake.toNumber(),
    winRate: stats.winRate.toNumber(),
  };
}
