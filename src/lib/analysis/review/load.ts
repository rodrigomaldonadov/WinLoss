import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import aliasesFile from "../../../../team-aliases.json";

import { applyTemperature } from "@/lib/analysis/calibration";
import { legMatchesFixture } from "@/lib/analysis/community";
import {
  closingMarketFromRecord,
  type OneXTwoMarket,
  type TotalsMarket,
} from "@/lib/analysis/market";
import {
  scoreMatrix,
  type ModelMatch,
} from "@/lib/analysis/model";
import {
  isTeamAliasesFile,
  normalizeTeamName,
  type TeamAliasesFile,
} from "@/lib/analysis/team-names";
import { weekStartDate } from "@/lib/analysis/week";
import { prisma } from "@/lib/prisma";

import {
  actualOutcomeFromGoals,
  buildReviewRows,
  buildScores,
} from "./build";
import {
  modelMarketsFromMatrix,
  topScoresFromMatrix,
  type ModelMarkets,
  type TopScore,
} from "./markets";
import {
  getRatingsAsOf,
  reviewModelParams,
} from "./ratings";
import { createLimiter } from "./limit";
import {
  selectLatestSnapshot,
  snapshotCommunity,
} from "./snapshot";
import type {
  ReviewCalibration,
  ReviewCommunity,
  ReviewModelMarkets,
  ReviewPrivateLeg,
  ReviewResult,
} from "./types";

const aliases: TeamAliasesFile = isTeamAliasesFile(aliasesFile)
  ? aliasesFile
  : { version: 1, teams: {} };

const DAY_MS = 86_400_000;
const reviewLimiter = createLimiter(
  Number(process.env.ANALYSIS_REVIEW_CONCURRENCY ?? "2"),
);

type Triple = { home: number; draw: number; away: number };

function parseTriple(value: unknown): Triple | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.home !== "number" ||
    typeof record.draw !== "number" ||
    typeof record.away !== "number"
  ) {
    return null;
  }
  return { home: record.home, draw: record.draw, away: record.away };
}

function parseModelMarkets(value: unknown): ReviewModelMarkets | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const numberOrNull = (key: string) =>
    typeof record[key] === "number" ? (record[key] as number) : null;
  const home = numberOrNull("home");
  const draw = numberOrNull("draw");
  const away = numberOrNull("away");
  if (home === null && draw === null && away === null) return null;
  return {
    home,
    draw,
    away,
    over15: numberOrNull("over15"),
    over25: numberOrNull("over25"),
    over35: numberOrNull("over35"),
    btts: numberOrNull("btts"),
  };
}

function parseTopScores(value: unknown): TopScore[] | null {
  if (!Array.isArray(value)) return null;
  const scores = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.home !== "number" ||
      typeof record.away !== "number" ||
      typeof record.probability !== "number"
    ) {
      return [];
    }
    return [
      {
        home: record.home,
        away: record.away,
        probability: record.probability,
      },
    ];
  });
  return scores.length > 0 ? scores : null;
}

function toOneXTwo(value: Triple | null): OneXTwoMarket | null {
  if (!value) return null;
  return { ...value, overround: 0 };
}

function finalTotalsFor({
  finalSource,
  marketPre,
  marketClose,
  modelMarkets,
}: {
  finalSource: string;
  marketPre: TotalsMarket | null;
  marketClose: TotalsMarket | null;
  modelMarkets: ReviewModelMarkets | null;
}): { over25: number; under25: number } | null {
  if (finalSource === "market") {
    const totals = marketPre ?? marketClose;
    return totals
      ? { over25: totals.over25, under25: totals.under25 }
      : null;
  }
  if (finalSource === "model" && modelMarkets?.over25 !== null && modelMarkets?.over25 !== undefined) {
    return {
      over25: modelMarkets.over25,
      under25: 1 - modelMarkets.over25,
    };
  }
  return null;
}

function calibrationContext({
  calibration,
  probability,
}: {
  calibration: Prisma.JsonValue | null;
  probability: number | null;
}): ReviewCalibration {
  if (probability === null || !Array.isArray(calibration)) return null;
  const percent = probability * 100;
  for (const item of calibration) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const count = typeof record.count === "number" ? record.count : 0;
    const observed =
      typeof record.observed === "number" ? record.observed : null;
    const bin = typeof record.bin === "string" ? record.bin : null;
    if (count <= 0 || observed === null || !bin) continue;
    const match = /^(\d+)-(\d+)$/.exec(bin);
    if (!match) continue;
    const from = Number(match[1]);
    const to = Number(match[2]);
    if (percent >= from && percent < to) {
      return { probability, observed, sample: count, bin };
    }
  }
  return null;
}

function fairOddsForSelection({
  marketKey,
  pick,
  line,
  marketPre,
  marketClose,
  marketTotalsPre,
  marketTotalsClose,
}: {
  marketKey: string;
  pick: string | null;
  line: number | null;
  marketPre: OneXTwoMarket | null;
  marketClose: OneXTwoMarket | null;
  marketTotalsPre: TotalsMarket | null;
  marketTotalsClose: TotalsMarket | null;
}): number | null {
  const market = marketPre ?? marketClose;
  if (marketKey === "MATCH_RESULT" && market) {
    const probability =
      pick === "HOME"
        ? market.home
        : pick === "DRAW"
          ? market.draw
          : pick === "AWAY"
            ? market.away
            : null;
    return probability && probability > 0 ? 1 / probability : null;
  }
  if (marketKey === "TOTAL_GOALS" && (line === null || line === 2.5)) {
    const totals = marketTotalsPre ?? marketTotalsClose;
    if (!totals) return null;
    const probability =
      pick === "OVER" ? totals.over25 : pick === "UNDER" ? totals.under25 : null;
    return probability && probability > 0 ? 1 / probability : null;
  }
  return null;
}

export type HistoricalReviewMatch = {
  id: string;
  competition: string;
  competitionCode: string | null;
  playedAt: Date;
  homeGoals: number;
  awayGoals: number;
  homeTeamId: string;
  awayTeamId: string;
  odds: Prisma.JsonValue | null;
};

export type GetMatchReviewArgs = {
  userId: string;
  matchId: string;
  client?: PrismaClient;
};

export async function getMatchReview(
  args: GetMatchReviewArgs,
): Promise<ReviewResult | null> {
  return reviewLimiter.run(() => getMatchReviewInternal(args));
}

async function getMatchReviewInternal({
  userId,
  matchId,
  client = prisma,
}: GetMatchReviewArgs): Promise<ReviewResult | null> {
  const match = await client.historicalMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      competition: true,
      competitionCode: true,
      playedAt: true,
      homeGoals: true,
      awayGoals: true,
      odds: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { canonicalName: true } },
      awayTeam: { select: { canonicalName: true } },
    },
  });
  if (!match) return null;

  const homeName = match.homeTeam.canonicalName;
  const awayName = match.awayTeam.canonicalName;
  const matchKey = `${normalizeTeamName(homeName)}|${normalizeTeamName(awayName)}|${match.playedAt.toISOString().slice(0, 10)}`;
  const marketRecord = closingMarketFromRecord(match.odds);
  const marketPre = marketRecord.pre.oneXtwo;
  let marketClose = marketRecord.oneXtwo;
  const marketTotalsPre = marketRecord.pre.totals;
  const marketTotalsClose = marketRecord.totals;

  const snapshotCandidates = await client.analysisSnapshot.findMany({
    where: { matchKey },
    orderBy: { snapshotAt: "desc" },
  });
  const snapshot = selectLatestSnapshot(snapshotCandidates);

  const actualOutcome = actualOutcomeFromGoals(match.homeGoals, match.awayGoals);
  const actualTotal = match.homeGoals + match.awayGoals;
  const actualBtts = match.homeGoals > 0 && match.awayGoals > 0;

  let mode: "saved" | "reconstructed" = "reconstructed";
  let warning: string | null =
    "Reconstrucción retrospectiva: los ratings usan solo partidos anteriores a la semana del encuentro, pero los parámetros del campeón se ajustaron con datos que incluyen este periodo. Es una aproximación, no la predicción que se mostró en su momento.";
  let modelMarkets: ReviewModelMarkets | null = null;
  let final: Triple | null = null;
  let finalSource = "none";
  let topScores: TopScore[] | null = null;
  let community: ReviewCommunity | null = null;
  let ratingsVersion: string | null = null;
  let ratingsAsOf: string | null = null;
  let cacheHit = false;
  let calculatedAt = new Date();

  if (snapshot) {
    mode = "saved";
    warning = null;
    if (!marketClose) {
      marketClose = toOneXTwo(parseTriple(snapshot.marketProbability));
    }
    final = parseTriple(snapshot.finalProbability);
    finalSource = snapshot.finalSource;
    topScores = parseTopScores(snapshot.topScores);
    community = snapshotCommunity({
      available: snapshot.communityAvailable,
      sample: snapshot.communitySample,
      probabilities: snapshot.communityProbability,
    });
    ratingsVersion = snapshot.ratingsVersion;
    ratingsAsOf = snapshot.ratingsVersion?.includes(":")
      ? snapshot.ratingsVersion.slice(snapshot.ratingsVersion.indexOf(":") + 1)
      : null;
    calculatedAt = snapshot.snapshotAt;

    const storedMarkets = parseModelMarkets(snapshot.markets);
    const oneXtwo = parseTriple(snapshot.modelProbability);
    modelMarkets =
      storedMarkets ??
      (oneXtwo
        ? {
            home: oneXtwo.home,
            draw: oneXtwo.draw,
            away: oneXtwo.away,
            over15: null,
            over25: null,
            over35: null,
            btts: null,
          }
        : null);
  } else {
    const champion = await client.modelVersion.findFirst({
      where: { state: "CHAMPION" },
      orderBy: { promotedAt: "desc" },
    });
    const params = reviewModelParams(champion?.params ?? null);
    const modelVersionId = champion?.id ?? "default";

    if (!match.competitionCode) return null;

    const cached = await client.matchReviewCache.findUnique({
      where: {
        historicalMatchId_modelVersionId: {
          historicalMatchId: match.id,
          modelVersionId,
        },
      },
    });

    let reconstructed: {
      model: ModelMarkets;
      top: TopScore[];
      asOf: Date;
      version: string;
    } | null = null;

    if (cached) {
      const record =
        cached.probabilities &&
        typeof cached.probabilities === "object" &&
        !Array.isArray(cached.probabilities)
          ? (cached.probabilities as Record<string, unknown>)
          : {};
      const stored = parseModelMarkets(record.model);
      const storedTop = parseTopScores(record.topScores);
      const version =
        typeof record.ratingsVersion === "string"
          ? record.ratingsVersion
          : null;
      if (stored && storedTop && version) {
        reconstructed = {
          model: stored as ModelMarkets,
          top: storedTop,
          asOf: cached.ratingsAsOf,
          version,
        };
        cacheHit = true;
        calculatedAt = cached.calculatedAt;
      }
    }

    if (!reconstructed) {
      const trainingRows = await client.historicalMatch.findMany({
        where: {
          competitionCode: match.competitionCode,
          playedAt: { lt: weekStartDate(match.playedAt) },
        },
        select: {
          homeTeamId: true,
          awayTeamId: true,
          homeGoals: true,
          awayGoals: true,
          playedAt: true,
        },
        orderBy: { playedAt: "asc" },
      });
      const training: ModelMatch[] = trainingRows.map((row) => ({
        homeTeamId: row.homeTeamId,
        awayTeamId: row.awayTeamId,
        homeGoals: row.homeGoals,
        awayGoals: row.awayGoals,
        playedAt: row.playedAt,
      }));
      const ratings = await getRatingsAsOf({
        prisma: client,
        competitionCode: match.competitionCode,
        date: match.playedAt,
        matches: training,
        modelVersionId,
        params,
      });
      if (!ratings.ratings) return null;

      const matrix = scoreMatrix(
        ratings.ratings,
        match.homeTeamId,
        match.awayTeamId,
      );
      const raw = modelMarketsFromMatrix(matrix);
      const calibrated = applyTemperature(
        [raw.home, raw.draw, raw.away],
        params.temperature,
      );
      const model: ModelMarkets = {
        ...raw,
        home: calibrated[0] ?? raw.home,
        draw: calibrated[1] ?? raw.draw,
        away: calibrated[2] ?? raw.away,
      };
      const top = topScoresFromMatrix(matrix);
      const version = `${champion?.name ?? "default"}:${ratings.ratings.asOf.toISOString()}`;
      reconstructed = {
        model,
        top,
        asOf: ratings.ratings.asOf,
        version,
      };
      await client.matchReviewCache.upsert({
        where: {
          historicalMatchId_modelVersionId: {
            historicalMatchId: match.id,
            modelVersionId,
          },
        },
        create: {
          historicalMatchId: match.id,
          modelVersionId,
          probabilities: {
            model,
            topScores: top,
            ratingsVersion: version,
          } as unknown as Prisma.InputJsonValue,
          ratingsAsOf: ratings.ratings.asOf,
        },
        update: {
          probabilities: {
            model,
            topScores: top,
            ratingsVersion: version,
          } as unknown as Prisma.InputJsonValue,
          ratingsAsOf: ratings.ratings.asOf,
          calculatedAt: new Date(),
        },
      });
    }

    modelMarkets = reconstructed.model;
    topScores = reconstructed.top;
    ratingsVersion = reconstructed.version;
    ratingsAsOf = reconstructed.asOf.toISOString();

    const marketPrimary = marketPre ?? marketClose;
    final = marketPrimary
      ? { home: marketPrimary.home, draw: marketPrimary.draw, away: marketPrimary.away }
      : modelMarkets.home !== null &&
          modelMarkets.draw !== null &&
          modelMarkets.away !== null
        ? {
            home: modelMarkets.home,
            draw: modelMarkets.draw,
            away: modelMarkets.away,
          }
        : null;
    finalSource = marketPrimary ? "market" : "model";
  }

  const modelOneXtwo =
    modelMarkets &&
    modelMarkets.home !== null &&
    modelMarkets.draw !== null &&
    modelMarkets.away !== null
      ? {
          home: modelMarkets.home,
          draw: modelMarkets.draw,
          away: modelMarkets.away,
        }
      : null;

  const finalOneXtwo = final;
  const finalTotals = finalTotalsFor({
    finalSource,
    marketPre: marketTotalsPre,
    marketClose: marketTotalsClose,
    modelMarkets,
  });

  const rows =
    modelMarkets !== null
      ? buildReviewRows({
          actualOutcome,
          totalGoals: actualTotal,
          btts: actualBtts,
          marketPre,
          marketClose,
          marketTotalsPre,
          marketTotalsClose,
          model: modelMarkets,
          final: finalOneXtwo,
          finalTotals,
        })
      : [];

  const { scores, closestSource } = buildScores({
    actualOutcome,
    marketPre,
    marketClose,
    model: modelOneXtwo,
    final: finalOneXtwo,
  });

  const actualScoreInTop5 = topScores
    ? topScores.some(
        (score) => score.home === match.homeGoals && score.away === match.awayGoals,
      )
    : null;

  const evaluation = await client.modelEvaluation.findFirst({
    where: { competition: match.competition },
    orderBy: { asOf: "desc" },
    select: { calibration: true },
  });
  const actualProbability =
    modelOneXtwo === null
      ? null
      : actualOutcome === "HOME"
        ? modelOneXtwo.home
        : actualOutcome === "DRAW"
          ? modelOneXtwo.draw
          : modelOneXtwo.away;
  const calibration = calibrationContext({
    calibration: evaluation?.calibration ?? null,
    probability: actualProbability,
  });

  const privateLegs = await loadPrivateLegs({
    client,
    userId,
    match,
    homeName,
    awayName,
    marketPre,
    marketClose,
    marketTotalsPre,
    marketTotalsClose,
  });

  return {
    mode,
    warning,
    matchId: match.id,
    matchKey,
    competition: match.competition,
    competitionCode: match.competitionCode,
    kickoff: match.playedAt,
    homeName,
    awayName,
    homeGoals: match.homeGoals,
    awayGoals: match.awayGoals,
    actualOutcome,
    actualTotal,
    btts: actualBtts,
    rows,
    scores,
    closestSource,
    topScores,
    actualScoreInTop5,
    calibration,
    community,
    privateLegs,
    modelMarkets,
    marketPre: marketPre
      ? { home: marketPre.home, draw: marketPre.draw, away: marketPre.away }
      : null,
    marketClose: marketClose
      ? {
          home: marketClose.home,
          draw: marketClose.draw,
          away: marketClose.away,
        }
      : null,
    final1x2: finalOneXtwo,
    ratingsVersion,
    ratingsAsOf,
    cacheHit,
    calculatedAt,
  };
}

async function loadPrivateLegs({
  client,
  userId,
  match,
  homeName,
  awayName,
  marketPre,
  marketClose,
  marketTotalsPre,
  marketTotalsClose,
}: {
  client: PrismaClient;
  userId: string;
  match: HistoricalReviewMatch;
  homeName: string;
  awayName: string;
  marketPre: OneXTwoMarket | null;
  marketClose: OneXTwoMarket | null;
  marketTotalsPre: TotalsMarket | null;
  marketTotalsClose: TotalsMarket | null;
}): Promise<ReviewPrivateLeg[]> {
  const rows = await client.betLeg.findMany({
    where: {
      bet: { userId },
      eventDate: {
        gte: new Date(match.playedAt.getTime() - 2 * DAY_MS),
        lte: new Date(match.playedAt.getTime() + 2 * DAY_MS),
      },
    },
    select: {
      id: true,
      eventName: true,
      eventDate: true,
      odds: true,
      status: true,
      selections: {
        orderBy: { position: "asc" },
        select: {
          market: true,
          selection: true,
          marketKey: true,
          line: true,
          pick: true,
        },
      },
    },
  });

  return rows
    .filter((leg) =>
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
        { homeName, awayName, kickoff: match.playedAt },
        aliases,
      ),
    )
    .map((leg) => {
      const first = leg.selections[0];
      const fairOdds = first
        ? fairOddsForSelection({
            marketKey: first.marketKey,
            pick: first.pick,
            line: first.line === null ? null : Number(first.line),
            marketPre,
            marketClose,
            marketTotalsPre,
            marketTotalsClose,
          })
        : null;
      return {
        id: leg.id,
        eventName: leg.eventName,
        eventDate: leg.eventDate,
        odds: Number(leg.odds),
        status: leg.status,
        selections: leg.selections.map((selection) => ({
          market: selection.market,
          selection: selection.selection,
          line: selection.line === null ? null : Number(selection.line),
          pick: selection.pick,
        })),
        fairOdds,
      };
    });
}
