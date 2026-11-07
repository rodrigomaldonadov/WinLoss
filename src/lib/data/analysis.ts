import "server-only";

import aliasesFile from "../../../team-aliases.json";

import {
  aggregateCommunityForFixture,
  aggregatePrivateForFixture,
  type CommunityLeg,
} from "@/lib/analysis/community";
import type {
  AnalysisConfidence,
  AnalysisResult,
  AnalysisSourceKey,
} from "@/lib/analysis/engine";
import {
  ANALYSIS_WEIGHTS,
  type CompetitionWeightEntry,
} from "@/lib/analysis/weights";
import { isTeamAliasesFile, type TeamAliasesFile } from "@/lib/analysis/team-names";
import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;
const ENGINE_SOURCE = "analysis-engine";

const aliases: TeamAliasesFile = isTeamAliasesFile(aliasesFile)
  ? aliasesFile
  : { version: 1, teams: {} };

export type AnalysisFeedItem = {
  id: string;
  fixtureId: string;
  competition: string;
  competitionCode: string | null;
  kickoff: Date;
  homeName: string;
  awayName: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  final: AnalysisResult["final"];
  sources: AnalysisResult["sources"];
  reference: AnalysisResult["reference"];
  naiveReference: {
    brier: number;
    sample: number;
    probabilities: number[];
  } | null;
  notes: string[];
};

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

  return rows.map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const sources = parseSources(metadata.sources);
    const fixture = {
      homeName: row.homeName,
      awayName: row.awayName,
      kickoff: row.kickoff,
    };
    const community = aggregateCommunityForFixture(legs, fixture, aliases);
    const privateAggregate = aggregatePrivateForFixture(
      legs,
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
  });
}

export type ModelAccuracyRow = CompetitionWeightEntry & {
  competition: string;
};

/** Números del panel “Precisión del modelo”, tal como salieron del backtest. */
export function getModelAccuracy(): {
  generatedFrom: string;
  caveat: string;
  global: CompetitionWeightEntry;
  competitions: ModelAccuracyRow[];
} {
  const competitions = Object.entries(ANALYSIS_WEIGHTS.competitions).map(
    ([competition, entry]) => ({
      competition,
      ...entry,
      hasMarketBacktest: true,
    }),
  );
  return {
    generatedFrom: ANALYSIS_WEIGHTS.holdout.start,
    caveat: ANALYSIS_WEIGHTS.caveat,
    global: {
      code: null,
      weight: ANALYSIS_WEIGHTS.global.weight,
      temperature: 1,
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
