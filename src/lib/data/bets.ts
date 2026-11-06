import "server-only";

import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import type { BetStatus, BetType, LegStatus } from "@prisma/client";

import {
  calculateBetClosingLineValue,
  calculateBettingStats,
} from "@/lib/bet-math";
import { prisma } from "@/lib/prisma";

export type BetFilter = "pending" | "settled" | "all";
export type BetTypeFilter = "single" | "multiple" | "builder";
export type BetOrder = "recent" | "oldest" | "profit";

export type LegSelectionItem = {
  id: string;
  position: number;
  market: string;
  selection: string;
};

export type BetLegItem = {
  id: string;
  position: number;
  sport: string;
  competition: string | null;
  eventName: string;
  eventDate: Date | null;
  isBuilder: boolean;
  odds: number;
  closingOdds: number | null;
  status: LegStatus;
  selections: LegSelectionItem[];
};

export type BetListItem = {
  id: string;
  externalId: string | null;
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
  legs: BetLegItem[];
  // Campos derivados del primer leg para compatibilidad con la UI existente.
  sport: string;
  competition: string | null;
  eventName: string;
  market: string;
  selection: string;
  closingOdds: number | null;
};

export type BetDetail = BetListItem & {
  bankrollId: string;
  bookmakerId: string | null;
  notes: string | null;
};

type BetRecord = {
  id: string;
  externalId: string | null;
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
  legs: {
    id: string;
    position: number;
    sport: string;
    competition: string | null;
    eventName: string;
    eventDate: Date | null;
    isBuilder: boolean;
    odds: { toString(): string };
    closingOdds: { toString(): string } | null;
    status: LegStatus;
    selections: {
      id: string;
      position: number;
      market: string;
      selection: string;
    }[];
  }[];
};

/** Include reutilizable para hidratar un boleto con sus legs y selecciones. */
export const BET_RELATIONS_INCLUDE = {
  bankroll: { select: { id: true, name: true, currency: true } },
  bookmaker: { select: { id: true, name: true } },
  legs: {
    orderBy: { position: "asc" },
    include: {
      selections: { orderBy: { position: "asc" } },
    },
  },
} satisfies Prisma.BetInclude;

export function toBetListItem(bet: BetRecord): BetListItem {
  const legs: BetLegItem[] = bet.legs.map((leg) => ({
    id: leg.id,
    position: leg.position,
    sport: leg.sport,
    competition: leg.competition,
    eventName: leg.eventName,
    eventDate: leg.eventDate,
    isBuilder: leg.isBuilder,
    odds: Number(leg.odds),
    closingOdds: leg.closingOdds === null ? null : Number(leg.closingOdds),
    status: leg.status,
    selections: leg.selections.map((selection) => ({
      id: selection.id,
      position: selection.position,
      market: selection.market,
      selection: selection.selection,
    })),
  }));

  const firstLeg = legs[0];
  const firstSelection = firstLeg?.selections[0];

  return {
    id: bet.id,
    externalId: bet.externalId,
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
    legs,
    sport: firstLeg?.sport ?? bet.sport,
    competition: firstLeg?.competition ?? bet.competition,
    eventName: firstLeg?.eventName ?? bet.eventName,
    market: firstSelection?.market ?? bet.market,
    selection: firstSelection?.selection ?? bet.selection,
    closingOdds:
      firstLeg?.closingOdds ??
      (bet.closingOdds === null ? null : Number(bet.closingOdds)),
  };
}

export type BetListQuery = {
  filter?: BetFilter;
  /** Simple, Múltiple o Bet Builder. */
  type?: BetTypeFilter;
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
  /** Texto libre: evento, competición, selección o ID externo. */
  q?: string;
  /** Orden de resultados. */
  order?: BetOrder;
};

function buildBetFilters(query: BetListQuery): Prisma.BetWhereInput {
  const { filter = "all", type, from, to, sport, q } = query;

  const placedAt: { gte?: Date; lte?: Date } = {};
  if (from) placedAt.gte = from;
  if (to) placedAt.lte = to;

  const and: Prisma.BetWhereInput[] = [];

  if (type === "builder") {
    and.push({ betType: "SINGLE" }, { legs: { some: { isBuilder: true } } });
  } else if (type === "single") {
    and.push({ betType: "SINGLE" }, { legs: { none: { isBuilder: true } } });
  } else if (type === "multiple") {
    and.push({ betType: "COMBINED" });
  }

  if (sport) {
    and.push({ legs: { some: { sport: { equals: sport } } } });
  }

  if (q) {
    and.push({
      OR: [
        { externalId: { contains: q, mode: "insensitive" } },
        {
          legs: {
            some: { eventName: { contains: q, mode: "insensitive" } },
          },
        },
        {
          legs: {
            some: { competition: { contains: q, mode: "insensitive" } },
          },
        },
        {
          legs: {
            some: {
              selections: {
                some: { selection: { contains: q, mode: "insensitive" } },
              },
            },
          },
        },
      ],
    });
  }

  return {
    ...(filter === "pending"
      ? { status: "PENDING" }
      : filter === "settled"
        ? { status: { not: "PENDING" } }
        : {}),
    ...(Object.keys(placedAt).length > 0 ? { placedAt } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

export async function getBetsForUser(
  userId: string,
  query: BetListQuery = {},
): Promise<BetListItem[]> {
  const { take = 100, skip = 0, order = "recent" } = query;

  const orderBy: Prisma.BetOrderByWithRelationInput[] =
    order === "oldest"
      ? [{ placedAt: "asc" }, { createdAt: "asc" }]
      : order === "profit"
        ? [{ profit: { sort: "desc", nulls: "last" } }, { placedAt: "desc" }]
        : [{ placedAt: "desc" }, { createdAt: "desc" }];

  const bets = await prisma.bet.findMany({
    where: { userId, ...buildBetFilters(query) },
    orderBy,
    take,
    skip,
    include: BET_RELATIONS_INCLUDE,
  });

  return bets.map(toBetListItem);
}

export async function countBetsForUser(
  userId: string,
  query: Omit<BetListQuery, "take" | "skip"> = {},
): Promise<number> {
  return prisma.bet.count({
    where: { userId, ...buildBetFilters(query) },
  });
}

/** Deportes distintos registrados por el usuario (para el filtro avanzado). */
export async function getBetSports(userId: string): Promise<string[]> {
  const legs = await prisma.betLeg.findMany({
    where: { bet: { userId } },
    select: { sport: true },
    distinct: ["sport"],
    orderBy: { sport: "asc" },
  });

  return Array.from(new Set(legs.map((leg) => leg.sport))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export type ClosingLineValueByBookmaker = {
  bookmakerId: string | null;
  bookmakerName: string;
  averageClosingLineValue: Decimal | null;
  betsCount: number;
};

/** Promedio de CLV por boleto, agrupado por casa de apuestas. */
export async function getClosingLineValueByBookmaker(
  userId: string,
): Promise<ClosingLineValueByBookmaker[]> {
  const bets = await prisma.bet.findMany({
    where: { userId, legs: { some: { closingOdds: { not: null } } } },
    include: {
      bookmaker: { select: { id: true, name: true } },
      legs: { select: { odds: true, closingOdds: true } },
    },
  });

  const groups = new Map<string, { name: string; values: Decimal[] }>();

  for (const bet of bets) {
    const value = calculateBetClosingLineValue(bet.legs);
    if (!value) continue;

    const key = bet.bookmakerId ?? "none";
    const group =
      groups.get(key) ?? { name: bet.bookmaker?.name ?? "Sin casa", values: [] };
    group.values.push(value.value);
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
          ? sum
              .div(group.values.length)
              .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
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
    include: BET_RELATIONS_INCLUDE,
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
    select: {
      status: true,
      stake: true,
      odds: true,
      profit: true,
      isFreeBet: true,
    },
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
