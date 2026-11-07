import "server-only";

import type { MatchAnalysis } from "@prisma/client";
import aliasesFile from "../../../team-aliases.json";

import {
  aggregateCommunityForFixture,
  aggregatePrivateForFixture,
  legMatchesFixture,
  type CommunityLeg,
} from "@/lib/analysis/community";
import type {
  AnalysisConfidence,
  AnalysisResult,
  AnalysisSourceKey,
} from "@/lib/analysis/engine";
import type {
  AnalysisDetail,
  AnalysisFeedItem,
  AnalysisH2H,
  AnalysisH2HMatch,
  AnalysisPrivateLeg,
  AnalysisQuality,
  AnalysisTeamForm,
} from "@/lib/analysis/view";
import {
  ANALYSIS_WEIGHTS,
  ANALYSIS_MODEL_NAME,
  type CompetitionWeightEntry,
} from "@/lib/analysis/weights";
import { isTeamAliasesFile, type TeamAliasesFile } from "@/lib/analysis/team-names";
import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;
const ENGINE_SOURCE = "analysis-engine";
const FORM_LIMIT = 8;
const H2H_LIMIT = 8;

const aliases: TeamAliasesFile = isTeamAliasesFile(aliasesFile)
  ? aliasesFile
  : { version: 1, teams: {} };

export type {
  AnalysisDetail,
  AnalysisFeedItem,
} from "@/lib/analysis/view";

type StoredSources = Partial<Record<AnalysisSourceKey, AnalysisResult["sources"][AnalysisSourceKey]>>;

function defaultSource(
  key: AnalysisSourceKey,
  label: string,
): AnalysisResult["sources"][AnalysisSourceKey] {
  return {
    key,
    label,
    available: false,
    confidence: "INSUFFICIENT",
    probabilities: null,
    totals: null,
    sample: null,
    note: null,
  };
}

function parseSources(value: unknown): AnalysisResult["sources"] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as StoredSources)
      : {};
  return {
    market: record.market ?? defaultSource("market", "Mercado"),
    model: record.model ?? defaultSource("model", "Modelo estadístico"),
    community: record.community ?? defaultSource("community", "Comunidad"),
    private: record.private ?? defaultSource("private", "Tu historial"),
  };
}

function parseFinal(value: unknown): AnalysisResult["final"] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const home = typeof record.home === "number" ? record.home : null;
  const draw = typeof record.draw === "number" ? record.draw : null;
  const away = typeof record.away === "number" ? record.away : null;
  const over25 = typeof record.over25 === "number" ? record.over25 : null;
  const under25 = typeof record.under25 === "number" ? record.under25 : null;
  return {
    available: record.available === true && home !== null,
    source:
      record.source === "market" ||
      record.source === "model" ||
      record.source === "blend"
        ? record.source
        : "none",
    probabilities:
      home !== null && draw !== null && away !== null
        ? { home, draw, away }
        : null,
    totals:
      over25 !== null && under25 !== null ? { over25, under25 } : null,
    confidence:
      record.confidence === "HIGH" ||
      record.confidence === "MEDIUM" ||
      record.confidence === "LOW" ||
      record.confidence === "INSUFFICIENT"
        ? record.confidence
        : "INSUFFICIENT",
    weight: typeof record.weight === "number" ? record.weight : 0,
    temperature: typeof record.temperature === "number" ? record.temperature : 1,
    note: typeof record.note === "string" ? record.note : "",
  };
}

function parseReference(value: unknown): AnalysisResult["reference"] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    hasMarketBacktest: record.hasMarketBacktest === true,
    sample: typeof record.sample === "number" ? record.sample : 0,
    modelBrier: typeof record.modelBrier === "number" ? record.modelBrier : 0,
    marketBrier: typeof record.marketBrier === "number" ? record.marketBrier : 0,
    marketPreBrier:
      typeof record.marketPreBrier === "number" ? record.marketPreBrier : null,
    naiveBrier: typeof record.naiveBrier === "number" ? record.naiveBrier : 0,
    asOf: typeof record.asOf === "string" ? record.asOf : null,
  };
}

function parseNotes(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseNaiveReference(value: unknown): AnalysisFeedItem["naiveReference"] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (
    !record ||
    typeof record.brier !== "number" ||
    typeof record.sample !== "number" ||
    !Array.isArray(record.probabilities)
  ) {
    return null;
  }
  return {
    brier: record.brier,
    sample: record.sample,
    probabilities: record.probabilities.filter(
      (item): item is number => typeof item === "number",
    ),
  };
}

async function pendingLegs(now: Date, until: Date): Promise<CommunityLeg[]> {
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

  return legs.map((leg) => ({
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
}

/** Feed de análisis persistidos, con comunidad/privado calculados al vuelo. */
export async function getAnalysisFeed(
  userId: string,
  {
    days = 14,
    now = new Date(),
  }: {
    days?: number;
    now?: Date;
  } = {},
): Promise<AnalysisFeedItem[]> {
  const until = new Date(now.getTime() + days * DAY_MS);
  const [rows, legs] = await Promise.all([
    prisma.matchAnalysis.findMany({
      where: {
        source: ENGINE_SOURCE,
        kickoff: { gte: now, lte: until },
      },
      orderBy: { kickoff: "asc" },
    }),
    pendingLegs(now, until),
  ]);

  return rows.map((row) => toFeedItem(row, legs, userId));
}

function metadataOf(row: MatchAnalysis): Record<string, unknown> {
  return row.metadata &&
    typeof row.metadata === "object" &&
    !Array.isArray(row.metadata)
    ? (row.metadata as Record<string, unknown>)
    : {};
}

function toFeedItem(
  row: MatchAnalysis,
  legs: readonly CommunityLeg[],
  userId: string,
  privatePool: readonly CommunityLeg[] = legs,
): AnalysisFeedItem {
  const metadata = metadataOf(row);
  const sources = parseSources(metadata.sources);
  const fixture = {
    homeName: row.homeName,
    awayName: row.awayName,
    kickoff: row.kickoff,
  };
  const community = aggregateCommunityForFixture(legs, fixture, aliases);
  const privateAggregate = aggregatePrivateForFixture(
    privatePool,
    fixture,
    aliases,
    userId,
  );

  sources.community = {
    ...sources.community,
    available: community.users >= 5 && Boolean(community.probabilities),
    confidence:
      community.users >= 5 && community.probabilities ? "LOW" : "INSUFFICIENT",
    probabilities: community.probabilities,
    totals: community.totals,
    sample: community.users,
    note:
      community.users >= 5
        ? "Agregado anónimo de usuarios con picks"
        : `Muestra insuficiente (${community.users} usuarios; mínimo 5)`,
  };
  sources.private = {
    ...sources.private,
    available: privateAggregate.picks > 0,
    confidence: privateAggregate.picks > 0 ? "LOW" : "INSUFFICIENT",
    probabilities: privateAggregate.probabilities,
    totals: privateAggregate.totals,
    sample: privateAggregate.picks,
    note:
      privateAggregate.picks > 0
        ? "Tus picks registrados para este partido"
        : "Sin historial propio para este partido",
  };

  return {
    id: row.id,
    fixtureId:
      typeof metadata.fixtureId === "string"
        ? metadata.fixtureId
        : row.externalEventId,
    competition: row.competition,
    competitionCode: row.competitionCode,
    kickoff: row.kickoff,
    homeName: row.homeName,
    awayName: row.awayName,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    final: {
      ...parseFinal(row.probabilities),
      confidence: row.confidence as AnalysisConfidence,
    },
    sources,
    reference: parseReference(metadata.reference),
    naiveReference: parseNaiveReference(metadata.naiveReference),
    notes: parseNotes(metadata.notes),
  };
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseQuality(
  metadata: Record<string, unknown>,
  referenceAsOf: string | null,
): AnalysisQuality {
  return {
    generatedAt:
      typeof metadata.generatedAt === "string" ? metadata.generatedAt : null,
    marketCapturedAt:
      typeof metadata.marketCapturedAt === "string"
        ? metadata.marketCapturedAt
        : null,
    marketFresh: metadata.marketFresh === true,
    modelSample:
      typeof metadata.modelSample === "number" ? metadata.modelSample : null,
    sourcesUsed: parseStringArray(metadata.sourcesUsed),
    fixtureIds: parseStringArray(metadata.fixtureIds),
    referenceAsOf,
  };
}

function emptyForm(teamId: string, teamName: string): AnalysisTeamForm {
  return {
    teamId,
    teamName,
    matches: [],
    summary: {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    },
  };
}

function toTeamForm(
  teamId: string,
  teamName: string,
  rows: Array<{
    id: string;
    playedAt: Date;
    competition: string;
    homeTeamId: string;
    awayTeamId: string;
    homeGoals: number;
    awayGoals: number;
    homeTeam: { canonicalName: string };
    awayTeam: { canonicalName: string };
  }>,
): AnalysisTeamForm {
  const matches = rows.map((match) => {
    const home = match.homeTeamId === teamId;
    const goalsFor = home ? match.homeGoals : match.awayGoals;
    const goalsAgainst = home ? match.awayGoals : match.homeGoals;
    return {
      id: match.id,
      playedAt: match.playedAt,
      competition: match.competition,
      opponent: home
        ? match.awayTeam.canonicalName
        : match.homeTeam.canonicalName,
      venue: home ? ("home" as const) : ("away" as const),
      goalsFor,
      goalsAgainst,
      result:
        goalsFor > goalsAgainst
          ? ("W" as const)
          : goalsFor === goalsAgainst
            ? ("D" as const)
            : ("L" as const),
    };
  });

  return {
    teamId,
    teamName,
    matches,
    summary: {
      played: matches.length,
      wins: matches.filter((match) => match.result === "W").length,
      draws: matches.filter((match) => match.result === "D").length,
      losses: matches.filter((match) => match.result === "L").length,
      goalsFor: matches.reduce((total, match) => total + match.goalsFor, 0),
      goalsAgainst: matches.reduce(
        (total, match) => total + match.goalsAgainst,
        0,
      ),
    },
  };
}

function toH2H(
  rows: Array<{
    id: string;
    playedAt: Date;
    competition: string;
    homeTeamId: string;
    awayTeamId: string;
    homeGoals: number;
    awayGoals: number;
    homeTeam: { canonicalName: string };
    awayTeam: { canonicalName: string };
  }>,
  homeTeamId: string | null,
): AnalysisH2H {
  const matches: AnalysisH2HMatch[] = rows.map((match) => ({
    id: match.id,
    playedAt: match.playedAt,
    competition: match.competition,
    homeName: match.homeTeam.canonicalName,
    awayName: match.awayTeam.canonicalName,
    homeGoals: match.homeGoals,
    awayGoals: match.awayGoals,
  }));

  if (!homeTeamId) {
    return {
      matches,
      summary: { played: matches.length, homeWins: 0, draws: 0, awayWins: 0 },
    };
  }

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  for (const match of rows) {
    if (match.homeGoals === match.awayGoals) {
      draws += 1;
      continue;
    }
    const currentHomeWon =
      match.homeTeamId === homeTeamId
        ? match.homeGoals > match.awayGoals
        : match.awayGoals > match.homeGoals;
    if (currentHomeWon) homeWins += 1;
    else awayWins += 1;
  }

  return {
    matches,
    summary: { played: matches.length, homeWins, draws, awayWins },
  };
}

/** Detalle completo: fuentes, forma, H2H e historial privado del usuario. */
export async function getAnalysisDetail(
  userId: string,
  id: string,
): Promise<AnalysisDetail | null> {
  const row = await prisma.matchAnalysis.findFirst({
    where: { id, source: ENGINE_SOURCE },
  });
  if (!row) return null;

  const windowStart = new Date(row.kickoff.getTime() - DAY_MS);
  const windowEnd = new Date(row.kickoff.getTime() + DAY_MS);
  const privateStart = new Date(row.kickoff.getTime() - 2 * DAY_MS);
  const privateEnd = new Date(row.kickoff.getTime() + 2 * DAY_MS);
  const [legs, privateRows] = await Promise.all([
    pendingLegs(windowStart, windowEnd),
    prisma.betLeg.findMany({
      where: {
        bet: { userId },
        eventDate: { gte: privateStart, lte: privateEnd },
      },
      orderBy: { eventDate: "asc" },
      select: {
        id: true,
        status: true,
        eventName: true,
        eventDate: true,
        odds: true,
        selections: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            market: true,
            marketKey: true,
            selection: true,
            pick: true,
            line: true,
          },
        },
      },
    }),
  ]);

  const fixture = {
    homeName: row.homeName,
    awayName: row.awayName,
    kickoff: row.kickoff,
  };

  const matchedPrivate = privateRows.filter((leg) =>
    legMatchesFixture(
      {
        userId,
        eventName: leg.eventName,
        eventDate: leg.eventDate,
        odds: Number(leg.odds),
        isBuilder: false,
        shareAnonymousStats: true,
        selections: leg.selections.map((selection) => ({
          marketKey: selection.marketKey,
          pick: selection.pick,
          line: selection.line === null ? null : Number(selection.line),
        })),
      },
      fixture,
      aliases,
    ),
  );

  const privatePool: CommunityLeg[] = matchedPrivate.map((leg) => ({
    userId,
    eventName: leg.eventName,
    eventDate: leg.eventDate,
    odds: Number(leg.odds),
    isBuilder: false,
    shareAnonymousStats: true,
    selections: leg.selections.map((selection) => ({
      marketKey: selection.marketKey,
      pick: selection.pick,
      line: selection.line === null ? null : Number(selection.line),
    })),
  }));

  const privateLegs: AnalysisPrivateLeg[] = matchedPrivate.map((leg) => ({
    id: leg.id,
    status: leg.status,
    eventName: leg.eventName,
    eventDate: leg.eventDate,
    odds: Number(leg.odds),
    selections: leg.selections.map((selection) => ({
      id: selection.id,
      market: selection.market,
      selection: selection.selection,
      pick: selection.pick,
      line: selection.line === null ? null : Number(selection.line),
    })),
  }));

  const item = toFeedItem(row, legs, userId, privatePool);

  const historicalFilter = {
    playedAt: { lt: row.kickoff },
    ...(row.competitionCode
      ? { competitionCode: row.competitionCode }
      : { competition: row.competition }),
  };

  const [homeRows, awayRows, h2hRows] = await Promise.all([
    row.homeTeamId
      ? prisma.historicalMatch.findMany({
          where: {
            ...historicalFilter,
            OR: [
              { homeTeamId: row.homeTeamId },
              { awayTeamId: row.homeTeamId },
            ],
          },
          orderBy: { playedAt: "desc" },
          take: FORM_LIMIT,
          include: {
            homeTeam: { select: { canonicalName: true } },
            awayTeam: { select: { canonicalName: true } },
          },
        })
      : Promise.resolve([]),
    row.awayTeamId
      ? prisma.historicalMatch.findMany({
          where: {
            ...historicalFilter,
            OR: [
              { homeTeamId: row.awayTeamId },
              { awayTeamId: row.awayTeamId },
            ],
          },
          orderBy: { playedAt: "desc" },
          take: FORM_LIMIT,
          include: {
            homeTeam: { select: { canonicalName: true } },
            awayTeam: { select: { canonicalName: true } },
          },
        })
      : Promise.resolve([]),
    row.homeTeamId && row.awayTeamId
      ? prisma.historicalMatch.findMany({
          where: {
            playedAt: { lt: row.kickoff },
            OR: [
              {
                homeTeamId: row.homeTeamId,
                awayTeamId: row.awayTeamId,
              },
              {
                homeTeamId: row.awayTeamId,
                awayTeamId: row.homeTeamId,
              },
            ],
          },
          orderBy: { playedAt: "desc" },
          take: H2H_LIMIT,
          include: {
            homeTeam: { select: { canonicalName: true } },
            awayTeam: { select: { canonicalName: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const metadata = metadataOf(row);

  return {
    ...item,
    form: {
      home: row.homeTeamId
        ? toTeamForm(row.homeTeamId, row.homeName, homeRows)
        : emptyForm("", row.homeName),
      away: row.awayTeamId
        ? toTeamForm(row.awayTeamId, row.awayName, awayRows)
        : emptyForm("", row.awayName),
    },
    h2h: toH2H(h2hRows, row.homeTeamId),
    privateLegs,
    quality: parseQuality(metadata, item.reference.asOf),
  };
}


export type ModelAccuracyRow = CompetitionWeightEntry & {
  competition: string;
};

export type ModelAccuracy = {
  generatedFrom: string;
  model: string;
  caveat: string;
  holdout: { start: string; end: string | null };
  global: CompetitionWeightEntry;
  competitions: ModelAccuracyRow[];
};

/**
 * Números del panel “Precisión del modelo”, tal como salieron del backtest.
 * Es el mismo contrato que sirve GET /api/analysis/model.
 */
export function getModelAccuracy(): ModelAccuracy {
  const competitions = Object.entries(ANALYSIS_WEIGHTS.competitions).map(
    ([competition, entry]) => ({
      competition,
      ...entry,
      hasMarketBacktest: true,
    }),
  );
  return {
    generatedFrom: ANALYSIS_WEIGHTS.holdout.start,
    model: ANALYSIS_MODEL_NAME,
    caveat: ANALYSIS_WEIGHTS.caveat,
    holdout: {
      start: ANALYSIS_WEIGHTS.holdout.start,
      end: ANALYSIS_WEIGHTS.holdout.end ?? null,
    },
    global: {
      code: null,
      weight: ANALYSIS_WEIGHTS.global.weight,
      temperature: ANALYSIS_WEIGHTS.global.temperature,
      calibrationApplied: false,
      blendApplied: false,
      sample: ANALYSIS_WEIGHTS.global.sample,
      preSample: 0,
      modelBrier: ANALYSIS_WEIGHTS.global.modelBrier,
      modelLogLoss: 0,
      marketBrier: ANALYSIS_WEIGHTS.global.marketBrier,
      marketLogLoss: 0,
      marketPreBrier: null,
      naiveBrier: ANALYSIS_WEIGHTS.global.naiveBrier,
      calibratedBrier: 0,
      calibratedLogLoss: 0,
      blendTestSample: ANALYSIS_WEIGHTS.global.blendTestSample,
      blendTestMarketBrier: ANALYSIS_WEIGHTS.global.blendTestMarketBrier,
      blendTestBrier: ANALYSIS_WEIGHTS.global.blendTestBrier,
      blendImproved: ANALYSIS_WEIGHTS.global.blendImproved,
      asOf: ANALYSIS_WEIGHTS.holdout.end ?? null,
      hasMarketBacktest: true,
    },
    competitions,
  };
}
