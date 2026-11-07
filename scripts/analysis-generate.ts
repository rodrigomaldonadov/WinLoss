/**
 * Genera TeamRating y MatchAnalysis para los próximos partidos.
 *
 * Requiere haber importado históricos y, opcionalmente, fixtures con cuotas o
 * próximos partidos de APIs. Uso manual:
 *
 *   npm run analysis:generate
 */

import { existsSync, readFileSync } from "node:fs";

import { Prisma, PrismaClient } from "@prisma/client";

import {
  aggregateCommunityForFixture,
  type CommunityLeg,
} from "../src/lib/analysis/community";
import { naiveProbabilities } from "../src/lib/analysis/calibration";
import { buildAnalysis, type AnalysisConfidence } from "../src/lib/analysis/engine";
import {
  FIXTURE_MAX_AGE_MS,
  isDomesticCompetitionCode,
} from "../src/lib/analysis/import";
import { closingMarketFromRecord } from "../src/lib/analysis/market";
import { brierScore, outcomeIndex } from "../src/lib/analysis/metrics";
import {
  fitRatings,
  predictMatch,
  type ModelMatch,
  type Ratings,
} from "../src/lib/analysis/model";
import {
  isTeamAliasesFile,
  normalizeTeamName,
  suggestTeamAliases,
  type TeamAliasesFile,
} from "../src/lib/analysis/team-names";
import {
  ANALYSIS_MODEL_NAME,
  weightForCompetition,
} from "../src/lib/analysis/weights";

const ENGINE_SOURCE = "analysis-engine";
const HALF_LIFE_DAYS = 365;
const RIDGE = 70;
const DAY_MS = 86_400_000;
const WINDOW_DAYS = Number(process.env.ANALYSIS_WINDOW_DAYS ?? "14");

function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match?.[1]) {
      process.env[match[1]] ??= (match[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
}

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

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  const aliasJson = JSON.parse(readFileSync("team-aliases.json", "utf8"));
  if (!isTeamAliasesFile(aliasJson)) {
    throw new Error("team-aliases.json no tiene el formato esperado.");
  }
  const aliases: TeamAliasesFile = aliasJson;
  const aliasKeys = Object.keys(aliases.teams);

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

  const now = new Date();
  const until = new Date(now.getTime() + WINDOW_DAYS * DAY_MS);
  const upcoming = (await prisma.upcomingFixture.findMany({
    where: { kickoff: { gte: new Date(now.getTime() - 6 * 60 * 60 * 1000), lte: until } },
    orderBy: { kickoff: "asc" },
  })) as UpcomingFixtureRow[];

  if (upcoming.length === 0) {
    console.log(
      "No hay próximos partidos. Ejecuta npm run analysis:sync o coloca el CSV de fixtures.",
    );
    await prisma.$disconnect();
    return;
  }

  // Deduplica proveedores y conserva la fila con cuotas como principal.
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
      primary.homeTeamId ?? sorted.find((row) => row.homeTeamId)?.homeTeamId ?? null;
    const awayTeamId =
      primary.awayTeamId ?? sorted.find((row) => row.awayTeamId)?.awayTeamId ?? null;
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

  const ratingsByCode = new Map<string, Ratings>();
  const competitionNameByCode = new Map<string, string>();
  const ratingAsOf = dayStart(now);

  for (const code of codes) {
    const matches = historicalByCode.get(code) ?? [];
    if (matches.length < 80) continue;
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
    competitionNameByCode.set(code, matches[0]!.competition);

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
          params: {
            model: ANALYSIS_MODEL_NAME,
            rho: ratings.rho,
            halfLifeDays: HALF_LIFE_DAYS,
            ridge: RIDGE,
            effectiveSample: ratings.effectiveSample,
          } as unknown as Prisma.InputJsonValue,
        },
        update: {
          competitionCode: code,
          attack: strength.attack,
          defense: strength.defense,
          homeAdvantage: ratings.homeAdvantage,
          leagueAvgHomeGoals: ratings.leagueAvgHomeGoals,
          leagueAvgAwayGoals: ratings.leagueAvgAwayGoals,
          sampleMatches: strength.matches,
          params: {
            model: ANALYSIS_MODEL_NAME,
            rho: ratings.rho,
            halfLifeDays: HALF_LIFE_DAYS,
            ridge: RIDGE,
            effectiveSample: ratings.effectiveSample,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
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
      isBuilder: true,
      eventName: true,
      eventDate: true,
      odds: true,
      status: true,
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
      unresolved.set(fixture.primary.homeName, (unresolved.get(fixture.primary.homeName) ?? 0) + 1);
    }
    if (!fixture.awayTeamId) {
      unresolved.set(fixture.primary.awayName, (unresolved.get(fixture.primary.awayName) ?? 0) + 1);
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

  await prisma.$transaction(async (tx) => {
    await tx.matchAnalysis.deleteMany({ where: { source: ENGINE_SOURCE } });
    if (analyses.length > 0) {
      await tx.matchAnalysis.createMany({
        data: analyses,
        skipDuplicates: true,
      });
    }
  });

  console.log("");
  console.log(`Próximos partidos analizados: ${fixtures.length}`);
  console.log(`Con mercado: ${marketCount}`);
  console.log(`Con modelo: ${modelCount}`);
  console.log(`Con comunidad (>=5 usuarios): ${communityCount}`);
  console.log(`Sin probabilidad final: ${insufficientCount}`);
  console.log(`Equipos sin resolver: ${unresolved.size}`);
  if (unresolved.size > 0) {
    console.log("");
    for (const [name, count] of [...unresolved.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const suggestions = suggestTeamAliases(name, aliasKeys, 3);
      console.log(
        `- ${name} (${count})${suggestions.length ? ` → ${suggestions.join(", ")}` : ""}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
