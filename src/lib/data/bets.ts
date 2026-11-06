import "server-only";

import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import type { BetStatus, BetType } from "@prisma/client";

import { calculateBettingStats, calculateClosingLineValue, roundMoney } from "@/lib/bet-math";
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
  closingOdds: number | null;
  bankroll: { id: string; name: string; currency: string };
  bookmaker: { id: string; name: string } | null;
};

export type BetDetail = BetListItem & {
  bankrollId: string;
  bookmakerId: string | null;
  notes: string | null;
};

function toBetListItem(bet: {
  id: string;
  sport: string;
  competition: string | null;
  eventName: string;
  market: string;
  selection: string;
  odds: { toString(): string };
  stake: { toString(): string };
  status: BetStatus;
  betType: BetType;
  isFreeBet: boolean;
  placedAt: Date;
  settledAt: Date | null;
  payout: { toString(): string } | null;
  profit: { toString(): string } | null;
  closingOdds: { toString(): string } | null;
  bankroll: { id: string; name: string; currency: string };
  bookmaker: { id: string; name: string } | null;
}): BetListItem {
  return {
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
    closingOdds: bet.closingOdds === null ? null : Number(bet.closingOdds),
    bankroll: bet.bankroll,
    bookmaker: bet.bookmaker,
  };
}

export type BetListQuery = {
  filter?: BetFilter;
  /** Resultados por página. */
  take?: number;
  /** Saltos para paginación (skip). */
  skip?: number;
  /** Desde (inclusive) para `placedAt`. */
  from?: Date;
  /** Hasta (inclusive) para `placedAt`. */
  to?: Date;
  /** Deporte exacto. */
  sport?: string;
};

export async function getBetsForUser(
  userId: string,
  query: BetListQuery = {},
): Promise<BetListItem[]> {
  const { filter = "all", take = 100, skip = 0, from, to, sport } = query;

  const placedAt: { gte?: Date; lte?: Date } = {};
  if (from) placedAt.gte = from;
  if (to) placedAt.lte = to;

  const bets = await prisma.bet.findMany({
    where: {
      userId,
      ...(filter === "pending"
        ? { status: "PENDING" }
        : filter === "settled"
          ? { status: { not: "PENDING" } }
          : {}),
      ...(sport ? { sport: { equals: sport } } : {}),
      ...(Object.keys(placedAt).length > 0 ? { placedAt } : {}),
    },
    orderBy: [{ placedAt: "desc" }, { createdAt: "desc" }],
    take,
    skip,
    include: {
      bankroll: { select: { id: true, name: true, currency: true } },
      bookmaker: { select: { id: true, name: true } },
    },
  });

  return bets.map(toBetListItem);
}

export async function countBetsForUser(
  userId: string,
  query: Omit<BetListQuery, "take" | "skip"> = {},
): Promise<number> {
  const { filter = "all", from, to, sport } = query;

  const placedAt: { gte?: Date; lte?: Date } = {};
  if (from) placedAt.gte = from;
  if (to) placedAt.lte = to;

  const where: Prisma.BetWhereInput = {
    userId,
    ...(filter === "pending"
      ? { status: "PENDING" }
      : filter === "settled"
        ? { status: { not: "PENDING" } }
        : {}),
    ...(sport ? { sport: { equals: sport } } : {}),
    ...(Object.keys(placedAt).length > 0 ? { placedAt } : {}),
  };

  return prisma.bet.count({ where });
}

/** Deportes distintos registrados por el usuario (para el filtro avanzado). */
export async function getBetSports(userId: string): Promise<string[]> {
  const bets = await prisma.bet.findMany({
    where: { userId },
    select: { sport: true },
    orderBy: { sport: "asc" },
  });

  return Array.from(new Set(bets.map((bet) => bet.sport))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export type ClosingLineValueByBookmaker = {
  bookmakerId: string | null;
  bookmakerName: string;
  averageClosingLineValue: Decimal | null;
  betsCount: number;
};

/** Promedio de CLV agrupado por casa de apuestas (o "Sin casa" para apuestas sin casa). */
export async function getClosingLineValueByBookmaker(
  userId: string,
): Promise<ClosingLineValueByBookmaker[]> {
  const bets = await prisma.bet.findMany({
    where: { userId, closingOdds: { not: null } },
    include: { bookmaker: { select: { id: true, name: true } } },
  });

  const groups = new Map<string, { name: string; values: Decimal[] }>();

  for (const bet of bets) {
    const value = calculateClosingLineValue(bet.odds, bet.closingOdds);
    if (!value) continue;

    const key = bet.bookmakerId ?? "none";
    const group =
      groups.get(key) ?? { name: bet.bookmaker?.name ?? "Sin casa", values: [] };
    group.values.push(value.percentage);
    groups.set(key, group);
  }

  const result: ClosingLineValueByBookmaker[] = [];
  for (const [key, group] of groups) {
    const sum = group.values.reduce(
      (acc, current) => acc.plus(current),
      new Decimal(0),
    );
    result.push({
      bookmakerId: key === "none" ? null : key,
      bookmakerName: group.name,
      averageClosingLineValue:
        group.values.length > 0
          ? roundMoney(sum.div(group.values.length))
          : null,
      betsCount: group.values.length,
    });
  }

  return result.sort(
    (a, b) =>
      (b.averageClosingLineValue?.toNumber() ?? 0) -
      (a.averageClosingLineValue?.toNumber() ?? 0),
  );
}

export async function getBetForUser(
  userId: string,
  id: string,
): Promise<BetDetail | null> {
  const bet = await prisma.bet.findFirst({
    where: { id, userId },
    include: {
      bankroll: { select: { id: true, name: true, currency: true } },
      bookmaker: { select: { id: true, name: true } },
    },
  });

  if (!bet) return null;

  return {
    ...toBetListItem(bet),
    bankrollId: bet.bankrollId,
    bookmakerId: bet.bookmakerId,
    notes: bet.notes,
  };
}

export async function getRecentBets(userId: string, take = 5) {
  return getBetsForUser(userId, { filter: "all", take });
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
