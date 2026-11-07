import type { Prisma, PrismaClient } from "@prisma/client";

import {
  fitRatings,
  type ModelMatch,
  type Ratings,
  type TeamStrength,
} from "@/lib/analysis/model";
import { readModelParams, type ModelParams } from "@/lib/analysis/model-version";
import { weekStartDate } from "@/lib/analysis/week";

export const DEFAULT_REVIEW_PARAMS: ModelParams = {
  halfLifeDays: 365,
  ridge: 70,
  homeAdvantageMode: "fit",
  temperature: 1,
};

export const MIN_REVIEW_TRAINING = 200;

export function matchesBeforeWeek(
  matches: readonly ModelMatch[],
  date: Date,
): ModelMatch[] {
  const cutoff = weekStartDate(date);
  return matches.filter((match) => match.playedAt.getTime() < cutoff.getTime());
}

export function serializeRatings(ratings: Ratings): Prisma.InputJsonValue {
  return {
    teams: [...ratings.teams.entries()].map(([teamId, strength]) => ({
      teamId,
      attack: strength.attack,
      defense: strength.defense,
      matches: strength.matches,
      weight: strength.weight,
    })),
    homeAdvantage: ratings.homeAdvantage,
    rho: ratings.rho,
    asOf: ratings.asOf.toISOString(),
    sample: ratings.sample,
    effectiveSample: ratings.effectiveSample,
    leagueAvgHomeGoals: ratings.leagueAvgHomeGoals,
    leagueAvgAwayGoals: ratings.leagueAvgAwayGoals,
    halfLifeDays: ratings.halfLifeDays,
    ridge: ratings.ridge,
  } as unknown as Prisma.InputJsonValue;
}

export function deserializeRatings(value: unknown): Ratings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.teams)) return null;
  const teams = new Map<string, TeamStrength>();
  for (const item of record.teams) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const team = item as Record<string, unknown>;
    if (typeof team.teamId !== "string") continue;
    teams.set(team.teamId, {
      attack: Number(team.attack ?? 0),
      defense: Number(team.defense ?? 0),
      matches: Number(team.matches ?? 0),
      weight: Number(team.weight ?? 0),
    });
  }
  const asOf = typeof record.asOf === "string" ? new Date(record.asOf) : null;
  if (!asOf || Number.isNaN(asOf.getTime()) || teams.size === 0) return null;
  return {
    teams,
    homeAdvantage: Number(record.homeAdvantage ?? 0),
    rho: Number(record.rho ?? 0),
    asOf,
    sample: Number(record.sample ?? 0),
    effectiveSample: Number(record.effectiveSample ?? 0),
    leagueAvgHomeGoals: Number(record.leagueAvgHomeGoals ?? 1.4),
    leagueAvgAwayGoals: Number(record.leagueAvgAwayGoals ?? 1.1),
    halfLifeDays: Number(record.halfLifeDays ?? 365),
    ridge: Number(record.ridge ?? 70),
  };
}

export function applyHomeAdvantage(
  ratings: Ratings,
  params: ModelParams,
): Ratings {
  if (params.homeAdvantageMode !== "league") return ratings;
  return {
    ...ratings,
    homeAdvantage: Math.log(
      Math.max(0.05, ratings.leagueAvgHomeGoals) /
        Math.max(0.05, ratings.leagueAvgAwayGoals),
    ),
  };
}

export type RatingsAsOfResult = {
  ratings: Ratings | null;
  matchesUsed: number;
  cacheHit: boolean;
};

/**
 * Ratings de la semana anterior al partido. Nunca usa partidos de la misma
 * semana ni posteriores, así que la reconstrucción no tiene fuga de futuro.
 */
export async function getRatingsAsOf({
  prisma,
  competitionCode,
  date,
  matches,
  modelVersionId,
  params,
}: {
  prisma: PrismaClient;
  competitionCode: string;
  date: Date;
  matches: readonly ModelMatch[];
  modelVersionId: string;
  params: ModelParams;
}): Promise<RatingsAsOfResult> {
  const weekDate = weekStartDate(date);
  const cached = await prisma.ratingAsOfCache.findUnique({
    where: {
      competitionCode_weekStart_modelVersionId: {
        competitionCode,
        weekStart: weekDate,
        modelVersionId,
      },
    },
  });
  if (cached) {
    const ratings = deserializeRatings(cached.ratings);
    if (ratings) {
      return {
        ratings,
        matchesUsed: cached.matchesUsed,
        cacheHit: true,
      };
    }
  }

  const training = matchesBeforeWeek(matches, date);
  if (training.length < MIN_REVIEW_TRAINING) {
    return { ratings: null, matchesUsed: training.length, cacheHit: false };
  }

  const fitted = applyHomeAdvantage(
    fitRatings(training, {
      asOf: weekDate,
      halfLifeDays: params.halfLifeDays,
      ridge: params.ridge,
    }),
    params,
  );

  await prisma.ratingAsOfCache.upsert({
    where: {
      competitionCode_weekStart_modelVersionId: {
        competitionCode,
        weekStart: weekDate,
        modelVersionId,
      },
    },
    create: {
      competitionCode,
      weekStart: weekDate,
      modelVersionId,
      ratings: serializeRatings(fitted),
      matchesUsed: training.length,
    },
    update: {
      ratings: serializeRatings(fitted),
      matchesUsed: training.length,
      calculatedAt: new Date(),
    },
  });

  return { ratings: fitted, matchesUsed: training.length, cacheHit: false };
}

export function reviewModelParams(value: Prisma.JsonValue | null): ModelParams {
  return readModelParams(value) ?? DEFAULT_REVIEW_PARAMS;
}
