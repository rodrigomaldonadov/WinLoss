import { readFileSync } from "node:fs";

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  aggregateCommunityForFixture,
  type CommunityLeg,
} from "@/lib/analysis/community";
import { naiveProbabilities } from "@/lib/analysis/calibration";
import {
  buildAnalysis,
  type AnalysisConfidence,
} from "@/lib/analysis/engine";
import {
  FIXTURE_MAX_AGE_MS,
  isDomesticCompetitionCode,
} from "@/lib/analysis/import";
import { closingMarketFromRecord } from "@/lib/analysis/market";
import { brierScore, outcomeIndex } from "@/lib/analysis/metrics";
import {
  fitRatings,
  predictMatch,
  type ModelMatch,
  type Ratings,
} from "@/lib/analysis/model";
import {
  isTeamAliasesFile,
  normalizeTeamName,
  type TeamAliasesFile,
} from "@/lib/analysis/team-names";
import {
  ANALYSIS_MODEL_NAME,
  weightForCompetition,
} from "@/lib/analysis/weights";

const ENGINE_SOURCE = "analysis-engine";
const HALF_LIFE_DAYS = 365;
const RIDGE = 70;
const DAY_MS = 86_400_000;

type Logger = (message: string) => void;

type UpcomingFixtureRow = {
  id: string;
  source: string;
  sourceKey: string;
  competition: string;
  competitionCode: string | null;
  kickoff: Date;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeName: string;
  awayName: string;
  odds: Prisma.JsonValue | null;
  oddsCapturedAt: Date | null;
};

export type GenerateJobSummary = {
  ok: boolean;
  timedOut: boolean;
  skipped: boolean;
  upcoming: number;
  analyses: number;
  market: number;
  model: number;
  community: number;
  insufficient: number;
  unresolved: string[];
  ratingsRefreshed: string[];
  ratingsReused: string[];
  ratingsBudgetExceeded: boolean;
  errors: string[];
  durationMs: number;
};

/** Regla de reajuste: nocturno por umbral, con respaldo semanal. */
export type RatingRefreshDecision = {
  refresh: boolean;
  reason:
    | "no-ratings"
    | "weekly-fallback"
    | "new-results"
    | "same-day"
    | "below-threshold";
  newResults: number;
};

export function shouldRefreshRatings({
  latestAsOf,
  now,
  newResults,
  minNewResults,
  maxAgeMs,
}: {
  latestAsOf: Date | null;
  now: Date;
  newResults: number;
  minNewResults: number;
  maxAgeMs: number;
}): RatingRefreshDecision {
  if (!latestAsOf) {
    return { refresh: true, reason: "no-ratings", newResults };
  }
  if (now.getTime() - latestAsOf.getTime() >= maxAgeMs) {
    return { refresh: true, reason: "weekly-fallback", newResults };
  }
  const today = dayStart(now);
  if (latestAsOf.getTime() >= today.getTime()) {
    return { refresh: false, reason: "same-day", newResults };
  }
  if (newResults >= minNewResults) {
    return { refresh: true, reason: "new-results", newResults };
  }
  return { refresh: false, reason: "below-threshold", newResults };
}

function dayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function fixtureKey(
  fixture: UpcomingFixtureRow,
  canonical: (raw: string) => string,
): string {
  return `${canonical(fixture.homeName)}|${canonical(fixture.awayName)}|${fixture.kickoff.toISOString().slice(0, 10)}`;
}

function sourcePriority(source: string): number {
  if (source === "football-data.co.uk:fixtures") return 0;
  if (source.includes("football-data")) return 1;
  if (source.includes("thesportsdb")) return 2;
  return 3;
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Recalcula ratings (máximo semanal) y MatchAnalysis para los próximos
 * partidos. Si no hay fixtures, termina sin tocar análisis.
 */
export async function runGenerateJob({
  prisma,
  aliasesPath = process.env.TEAM_ALIASES_FILE ?? "team-aliases.json",
  now = new Date(),
  deadline = Number.POSITIVE_INFINITY,
  windowDays = Number(process.env.ANALYSIS_WINDOW_DAYS ?? "14"),
  ratingMaxAgeDays = Number(process.env.ANALYSIS_RATING_MAX_AGE_DAYS ?? "7"),
  ratingMinNewResults = Number(
    process.env.ANALYSIS_RATING_MIN_NEW_RESULTS ?? "5",
  ),
  ratingBudgetMs = Number(process.env.ANALYSIS_RATINGS_BUDGET_MS ?? "90000"),
  logger = () => {},
}: {
  prisma: PrismaClient;
  aliasesPath?: string;
  now?: Date;
  deadline?: number;
  windowDays?: number;
  ratingMaxAgeDays?: number;
  ratingMinNewResults?: number;
  ratingBudgetMs?: number;
  logger?: Logger;
}): Promise<GenerateJobSummary> {
  const startedAt = Date.now();
  const empty = (overrides: Partial<GenerateJobSummary> = {}): GenerateJobSummary => ({
    ok: true,
    timedOut: false,
    skipped: false,
    upcoming: 0,
    analyses: 0,
    market: 0,
    model: 0,
    community: 0,
    insufficient: 0,
    unresolved: [],
    ratingsRefreshed: [],
    ratingsReused: [],
    ratingsBudgetExceeded: false,
    errors: [],
    durationMs: Date.now() - startedAt,
    ...overrides,
  });

  const aliasJson = JSON.parse(
    readFileSync(/* turbopackIgnore: true */ aliasesPath, "utf8"),
  );
  if (!isTeamAliasesFile(aliasJson)) {
    throw new Error("team-aliases.json no tiene el formato esperado.");
  }
  const aliases: TeamAliasesFile = aliasJson;

  const teams = await prisma.team.findMany({
    select: {
      id: true,
      canonicalName: true,
      normalizedName: true,
      aliases: { select: { normalized: true } },
    },
  });
  const byNormalized = new Map(teams.map((team) => [team.normalizedName, team]));
  const byAlias = new Map<string, (typeof teams)[number]>();
  for (const team of teams) {
    for (const alias of team.aliases) byAlias.set(alias.normalized, team);
  }

  function canonical(raw: string): string {
    const key = normalizeTeamName(raw);
    const canonicalName =
      aliases.teams[key] ??
      byNormalized.get(key)?.canonicalName ??
      byAlias.get(key)?.canonicalName ??
      raw;
    return normalizeTeamName(canonicalName) || key;
  }

  function canonicalName(raw: string): string {
    const key = normalizeTeamName(raw);
    return (
      aliases.teams[key] ??
      byNormalized.get(key)?.canonicalName ??
      byAlias.get(key)?.canonicalName ??
      raw
    );
  }

  const until = new Date(now.getTime() + windowDays * DAY_MS);
  const upcoming = (await prisma.upcomingFixture.findMany({
    where: {
      kickoff: {
        gte: new Date(now.getTime() - 6 * 60 * 60 * 1000),
        lte: until,
      },
    },
    orderBy: { kickoff: "asc" },
  })) as UpcomingFixtureRow[];

  if (upcoming.length === 0) {
    logger("No hay próximos partidos para analizar.");
    return empty({ skipped: true });
  }

  const groups = new Map<string, UpcomingFixtureRow[]>();
  for (const fixture of upcoming) {
    const key = fixtureKey(fixture, canonical);
    const list = groups.get(key) ?? [];
    list.push(fixture);
    groups.set(key, list);
  }

  const fixtures = [...groups.values()].map((rows) => {
    const sorted = [...rows].sort((a, b) => {
      const oddsA = a.odds ? 1 : 0;
      const oddsB = b.odds ? 1 : 0;
      if (oddsA !== oddsB) return oddsB - oddsA;
      return sourcePriority(a.source) - sourcePriority(b.source);
    });
    const primary = sorted[0]!;
    const oddsRow = sorted.find((row) => row.odds !== null) ?? null;
    const homeTeamId =
      primary.homeTeamId ??
      sorted.find((row) => row.homeTeamId)?.homeTeamId ??
      null;
    const awayTeamId =
      primary.awayTeamId ??
      sorted.find((row) => row.awayTeamId)?.awayTeamId ??
      null;
    const competitionCode =
      primary.competitionCode ??
      sorted.find((row) => row.competitionCode)?.competitionCode ??
      null;
    return {
      primary,
      rows: sorted,
      oddsRow,
      homeTeamId,
      awayTeamId,
      competitionCode,
      homeName: canonicalName(primary.homeName),
      awayName: canonicalName(primary.awayName),
    };
  });

  const codes = [
    ...new Set(
      fixtures
        .map((fixture) => fixture.competitionCode)
        .filter((code): code is string => Boolean(code)),
    ),
  ];

  const historical = await prisma.historicalMatch.findMany({
    where: {
      competitionCode: { in: codes },
      playedAt: { gte: new Date(Date.UTC(2022, 6, 1)) },
    },
    select: {
      competition: true,
      competitionCode: true,
      playedAt: true,
      homeTeamId: true,
      awayTeamId: true,
      homeGoals: true,
      awayGoals: true,
    },
    orderBy: { playedAt: "asc" },
  });

  const historicalByCode = new Map<string, typeof historical>();
  for (const match of historical) {
    if (!match.competitionCode) continue;
    const list = historicalByCode.get(match.competitionCode) ?? [];
    list.push(match);
    historicalByCode.set(match.competitionCode, list);
  }

  type NaiveReference = {
    brier: number;
    sample: number;
    probabilities: [number, number, number];
  };
  const naiveByCode = new Map<string, NaiveReference>();
  for (const [code, matches] of historicalByCode) {
    const outcomes = matches.map((match) =>
      outcomeIndex(match.homeGoals, match.awayGoals),
    );
    if (outcomes.length < 50) continue;
    const split = Math.floor(outcomes.length * 0.8);
    const train = outcomes.slice(0, split);
    const test = outcomes.slice(split);
    if (train.length === 0 || test.length === 0) continue;
    const probabilities = naiveProbabilities(train);
    const brier =
      test.reduce<number>(
        (sum, outcome) => sum + brierScore(probabilities, outcome),
        0,
      ) / test.length;
    naiveByCode.set(code, {
      brier,
      sample: test.length,
      probabilities,
    });
  }

  const ratingMaxAgeMs = Math.max(1, ratingMaxAgeDays) * DAY_MS;
  const ratingDeadline = Math.min(
    deadline,
    Date.now() + Math.max(1, ratingBudgetMs),
  );
  const ratingsByCode = new Map<string, Ratings>();
  const ratingsRefreshed: string[] = [];
  const ratingsReused: string[] = [];
  const errors: string[] = [];
  let timedOut = false;
  let ratingsBudgetExceeded = false;

  async function loadStoredRatings(code: string): Promise<Ratings | null> {
    const rows = await prisma.teamRating.findMany({
      where: { competitionCode: code },
      orderBy: { asOf: "desc" },
    });
    if (rows.length === 0) return null;

    const latestAsOf = rows[0]!.asOf;
    const latest = rows.filter(
      (row) => row.asOf.getTime() === latestAsOf.getTime(),
    );
    const first = latest[0]!;
    const params = jsonObject(first.params);
    const leagueAvgHomeGoals = Number(first.leagueAvgHomeGoals ?? 1.4);
    const leagueAvgAwayGoals = Number(first.leagueAvgAwayGoals ?? 1.1);
    const homeAdvantage =
      first.homeAdvantage !== null
        ? Number(first.homeAdvantage)
        : Math.log(
            Math.max(0.05, leagueAvgHomeGoals) /
              Math.max(0.05, leagueAvgAwayGoals),
          );

    return {
      teams: new Map(
        latest.map((row) => [
          row.teamId,
          {
            attack: Number(row.attack),
            defense: Number(row.defense),
            matches: row.sampleMatches,
            weight: row.sampleMatches,
          },
        ]),
      ),
      homeAdvantage,
      rho: typeof params.rho === "number" ? params.rho : 0,
      asOf: latestAsOf,
      sample: latest.reduce((sum, row) => sum + row.sampleMatches, 0),
      effectiveSample:
        typeof params.effectiveSample === "number"
          ? params.effectiveSample
          : 0,
      leagueAvgHomeGoals,
      leagueAvgAwayGoals,
      halfLifeDays:
        typeof params.halfLifeDays === "number"
          ? params.halfLifeDays
          : HALF_LIFE_DAYS,
      ridge: typeof params.ridge === "number" ? params.ridge : RIDGE,
    };
  }

  const ratingAsOf = dayStart(now);

  for (const code of codes) {
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }
    if (Date.now() >= ratingDeadline) {
      ratingsBudgetExceeded = true;
      logger(
        "[ratings] presupuesto de tiempo agotado; se usan los ratings guardados",
      );
      break;
    }
    const matches = historicalByCode.get(code) ?? [];
    if (matches.length < 80) continue;

    try {
      const latest = await prisma.teamRating.findFirst({
        where: { competitionCode: code },
        orderBy: { asOf: "desc" },
        select: { asOf: true },
      });
      const newResults = await prisma.historicalMatch.count({
        where: {
          competitionCode: code,
          ...(latest?.asOf
            ? { playedAt: { gt: latest.asOf, lte: now } }
            : {}),
        },
      });
      const decision = shouldRefreshRatings({
        latestAsOf: latest?.asOf ?? null,
        now,
        newResults,
        minNewResults: Math.max(1, ratingMinNewResults),
        maxAgeMs: ratingMaxAgeMs,
      });

      if (decision.refresh) {
        const modelMatches: ModelMatch[] = matches.map((match) => ({
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeGoals: match.homeGoals,
          awayGoals: match.awayGoals,
          playedAt: match.playedAt,
        }));
        const ratings = fitRatings(modelMatches, {
          asOf: now,
          halfLifeDays: HALF_LIFE_DAYS,
          ridge: RIDGE,
        });
        ratingsByCode.set(code, ratings);
        ratingsRefreshed.push(code);

        const ratingParams = {
          model: ANALYSIS_MODEL_NAME,
          rho: ratings.rho,
          halfLifeDays: HALF_LIFE_DAYS,
          ridge: RIDGE,
          effectiveSample: ratings.effectiveSample,
          ratingSample: ratings.sample,
          newResults: decision.newResults,
          adjustedAt: now.toISOString(),
          reason: decision.reason,
        } as unknown as Prisma.InputJsonValue;

        const competition = matches[0]!.competition;
        for (const [teamId, strength] of ratings.teams) {
          await prisma.teamRating.upsert({
            where: {
              competition_teamId_asOf: {
                competition,
                teamId,
                asOf: ratingAsOf,
              },
            },
            create: {
              competition,
              competitionCode: code,
              teamId,
              asOf: ratingAsOf,
              attack: strength.attack,
              defense: strength.defense,
              homeAdvantage: ratings.homeAdvantage,
              leagueAvgHomeGoals: ratings.leagueAvgHomeGoals,
              leagueAvgAwayGoals: ratings.leagueAvgAwayGoals,
              sampleMatches: strength.matches,
              params: ratingParams,
            },
            update: {
              competitionCode: code,
              attack: strength.attack,
              defense: strength.defense,
              homeAdvantage: ratings.homeAdvantage,
              leagueAvgHomeGoals: ratings.leagueAvgHomeGoals,
              leagueAvgAwayGoals: ratings.leagueAvgAwayGoals,
              sampleMatches: strength.matches,
              params: ratingParams,
            },
          });
        }
        logger(
          `[ratings] ${code}: reajustados ${ratings.teams.size} equipos (${decision.reason}, ${decision.newResults} resultados nuevos)`,
        );
      } else {
        const stored = await loadStoredRatings(code);
        if (stored) {
          ratingsByCode.set(code, stored);
          ratingsReused.push(code);
          logger(
            `[ratings] ${code}: reutilizados (${decision.reason}, ${decision.newResults} resultados nuevos)`,
          );
        } else {
          errors.push(`${code}: no hay ratings utilizables`);
        }
      }
    } catch (error) {
      errors.push(`ratings ${code}: ${String(error)}`);
      logger(`[ratings] ${code}: falló (${String(error)})`);
    }
  }

  if (timedOut) {
    logger("[generate] detenido por límite de tiempo antes de recalcular análisis");
    return empty({
      ok: false,
      timedOut: true,
      upcoming: fixtures.length,
      ratingsRefreshed,
      ratingsReused,
      ratingsBudgetExceeded,
      errors,
    });
  }

  const legs = await prisma.betLeg.findMany({
    where: {
      status: "PENDING",
      eventDate: {
        gte: new Date(now.getTime() - DAY_MS),
        lte: new Date(until.getTime() + DAY_MS),
      },
      bet: { status: "PENDING" },
    },
    select: {
      eventName: true,
      eventDate: true,
      odds: true,
      isBuilder: true,
      bet: {
        select: {
          userId: true,
          user: { select: { shareAnonymousStats: true } },
        },
      },
      selections: {
        select: { marketKey: true, pick: true, line: true },
      },
    },
  });

  const communityLegs: CommunityLeg[] = legs.map((leg) => ({
    userId: leg.bet.userId,
    eventName: leg.eventName,
    eventDate: leg.eventDate,
    odds: Number(leg.odds),
    isBuilder: leg.isBuilder,
    shareAnonymousStats: leg.bet.user.shareAnonymousStats,
    selections: leg.selections.map((selection) => ({
      marketKey: selection.marketKey,
      pick: selection.pick,
      line: selection.line === null ? null : Number(selection.line),
    })),
  }));

  const unresolved = new Map<string, number>();
  const analyses: Prisma.MatchAnalysisCreateManyInput[] = [];
  let marketCount = 0;
  let modelCount = 0;
  let communityCount = 0;
  let insufficientCount = 0;

  for (const fixture of fixtures) {
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }
    const code = fixture.competitionCode;
    const isDomesticLeague = isDomesticCompetitionCode(code);
    const ratings = code ? ratingsByCode.get(code) : undefined;
    const marketRecord = fixture.oddsRow
      ? closingMarketFromRecord(fixture.oddsRow.odds)
      : closingMarketFromRecord(null);
    const oneXtwo = marketRecord.pre.oneXtwo ?? marketRecord.oneXtwo;
    const totals = marketRecord.pre.totals ?? marketRecord.totals;
    const capturedAt = fixture.oddsRow?.oddsCapturedAt ?? null;
    const fresh = Boolean(
      capturedAt && now.getTime() - capturedAt.getTime() <= FIXTURE_MAX_AGE_MS,
    );

    const canModel = Boolean(
      isDomesticLeague &&
        ratings &&
        fixture.homeTeamId &&
        fixture.awayTeamId,
    );
    const prediction =
      canModel && ratings && fixture.homeTeamId && fixture.awayTeamId
        ? predictMatch(ratings, fixture.homeTeamId, fixture.awayTeamId)
        : null;
    const homeStrength = fixture.homeTeamId
      ? ratings?.teams.get(fixture.homeTeamId)
      : undefined;
    const awayStrength = fixture.awayTeamId
      ? ratings?.teams.get(fixture.awayTeamId)
      : undefined;
    const modelSample = canModel
      ? Math.min(homeStrength?.matches ?? 0, awayStrength?.matches ?? 0)
      : 0;

    if (!fixture.homeTeamId) {
      unresolved.set(
        fixture.primary.homeName,
        (unresolved.get(fixture.primary.homeName) ?? 0) + 1,
      );
    }
    if (!fixture.awayTeamId) {
      unresolved.set(
        fixture.primary.awayName,
        (unresolved.get(fixture.primary.awayName) ?? 0) + 1,
      );
    }

    const community = aggregateCommunityForFixture(
      communityLegs,
      {
        homeName: fixture.homeName,
        awayName: fixture.awayName,
        kickoff: fixture.primary.kickoff,
      },
      aliases,
    );

    const weights = weightForCompetition(fixture.primary.competition, code);
    const analysis = buildAnalysis({
      fixture: {
        id: fixture.primary.id,
        competition: fixture.primary.competition,
        competitionCode: code,
        kickoff: fixture.primary.kickoff,
        homeName: fixture.homeName,
        awayName: fixture.awayName,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        isDomesticLeague,
      },
      market: {
        oneXtwo,
        totals,
        capturedAt,
        fresh,
      },
      model: {
        available: canModel,
        probabilities: prediction
          ? {
              home: prediction.home,
              draw: prediction.draw,
              away: prediction.away,
              over25: prediction.over25,
              under25: prediction.under25,
              btts: prediction.btts,
            }
          : null,
        sample: modelSample,
      },
      community: {
        users: community.users,
        picks: community.picks,
        anonymousOptIn: community.anonymousOptIn,
        probabilities: community.probabilities,
        totals: community.totals,
        excludedUsers: community.excludedUsers,
      },
      private: null,
      weights,
      now,
    });

    const naiveReference = code ? (naiveByCode.get(code) ?? null) : null;
    if (!weights.hasMarketBacktest && naiveReference) {
      analysis.reference.naiveBrier = naiveReference.brier;
    }

    if (analysis.sources.market.available) marketCount += 1;
    if (analysis.sources.model.available) modelCount += 1;
    if (analysis.sources.community.available) communityCount += 1;
    if (!analysis.final.available) insufficientCount += 1;

    analyses.push({
      source: ENGINE_SOURCE,
      externalEventId: fixture.primary.id,
      competition: fixture.primary.competition,
      competitionCode: code,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeName: fixture.homeName,
      awayName: fixture.awayName,
      kickoff: fixture.primary.kickoff,
      probabilities: {
        available: analysis.final.available,
        source: analysis.final.source,
        home: analysis.final.probabilities?.home ?? null,
        draw: analysis.final.probabilities?.draw ?? null,
        away: analysis.final.probabilities?.away ?? null,
        over25: analysis.final.totals?.over25 ?? null,
        under25: analysis.final.totals?.under25 ?? null,
        weight: analysis.final.weight,
        temperature: analysis.final.temperature,
        note: analysis.final.note,
      } as unknown as Prisma.InputJsonValue,
      confidence: analysis.final.confidence as AnalysisConfidence as
        | "HIGH"
        | "MEDIUM"
        | "LOW"
        | "INSUFFICIENT",
      metadata: {
        sources: analysis.sources,
        reference: analysis.reference,
        notes: analysis.notes,
        modelSample,
        marketCapturedAt: capturedAt?.toISOString() ?? null,
        marketFresh: fresh,
        fixtureId: fixture.primary.id,
        fixtureIds: fixture.rows.map((row) => row.id),
        naiveReference,
        sourcesUsed: fixture.rows.map((row) => row.source),
        generatedAt: now.toISOString(),
      } as unknown as Prisma.InputJsonValue,
      generatedAt: now,
    });
  }

  if (timedOut) {
    logger("[generate] detenido por límite de tiempo; se conservan los análisis anteriores");
    return empty({
      ok: false,
      timedOut: true,
      upcoming: fixtures.length,
      ratingsRefreshed,
      ratingsReused,
      ratingsBudgetExceeded,
      errors,
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.matchAnalysis.deleteMany({ where: { source: ENGINE_SOURCE } });
      if (analyses.length > 0) {
        await tx.matchAnalysis.createMany({
          data: analyses,
          skipDuplicates: true,
        });
      }
    });
  } catch (error) {
    errors.push(`análisis: ${String(error)}`);
    logger(`[generate] no se pudieron guardar los análisis: ${String(error)}`);
    return empty({
      ok: false,
      upcoming: fixtures.length,
      ratingsRefreshed,
      ratingsReused,
      ratingsBudgetExceeded,
      errors,
    });
  }

  logger(
    `[generate] ${fixtures.length} partidos | mercado ${marketCount} | modelo ${modelCount} | comunidad ${communityCount} | sin probabilidad ${insufficientCount}`,
  );

  return {
    ok: errors.length === 0,
    timedOut: false,
    skipped: false,
    upcoming: fixtures.length,
    analyses: analyses.length,
    market: marketCount,
    model: modelCount,
    community: communityCount,
    insufficient: insufficientCount,
    unresolved: [...unresolved.keys()],
    ratingsRefreshed,
    ratingsReused,
    ratingsBudgetExceeded,
    errors,
    durationMs: Date.now() - startedAt,
  };
}
