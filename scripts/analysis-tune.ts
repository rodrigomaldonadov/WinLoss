/**
 * Genera un retador mensual con búsqueda acotada y validación walk-forward.
 * No modifica el campeón ni analysis-weights.json: solo crea el CHALLENGER.
 *
 *   npm run analysis:tune
 *   ANALYSIS_TUNE_QUICK=1 npm run analysis:tune
 */

import { readFileSync } from "node:fs";

import { Prisma, PrismaClient } from "@prisma/client";

import { loadEnv } from "../src/lib/analysis/api";
import {
  applyTemperature,
  fitBlendWeight,
} from "../src/lib/analysis/calibration";
import { closingMarketFromRecord } from "../src/lib/analysis/market";
import {
  brierScore,
  logLoss,
  outcomeIndex,
} from "../src/lib/analysis/metrics";
import {
  fitRatings,
  predictMatch,
  type ModelMatch,
  type Ratings,
} from "../src/lib/analysis/model";

const TARGET_CODES = ["E0", "SP1", "I1", "D1", "F1", "BRA", "ARG"];
const MIN_MATCHES = 200;
const VALIDATION_SPLIT = 0.7;

type HistoricalRow = {
  competition: string;
  competitionCode: string | null;
  playedAt: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  odds: Prisma.JsonValue | null;
};

type CandidateParams = {
  halfLifeDays: number;
  ridge: number;
  homeAdvantageMode: "fit" | "league";
  temperature: number;
};

type CandidateMetrics = {
  brier: number;
  logLoss: number;
  marketBrier: number | null;
  marketLogLoss: number | null;
  sample: number;
  marketSample: number;
  optimalWeight: number | null;
  perCompetition: {
    competition: string;
    sample: number;
    brier: number;
    logLoss: number;
    marketBrier: number | null;
  }[];
};

function toModelMatch(row: HistoricalRow): ModelMatch {
  return {
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
    playedAt: row.playedAt,
  };
}

function applyHomeAdvantage(
  ratings: Ratings,
  mode: CandidateParams["homeAdvantageMode"],
) {
  if (mode === "league") {
    ratings.homeAdvantage = Math.log(
      Math.max(0.05, ratings.leagueAvgHomeGoals) /
        Math.max(0.05, ratings.leagueAvgAwayGoals),
    );
  }
}

function evaluateCandidate(
  byCompetition: Map<string, HistoricalRow[]>,
  params: CandidateParams,
  now: Date,
  folds: number,
): CandidateMetrics {
  let totalModelBrier = 0;
  let totalModelLoss = 0;
  let totalMarketBrier = 0;
  let totalMarketLoss = 0;
  let total = 0;
  let marketTotal = 0;
  const blendModel: number[][] = [];
  const blendMarket: number[][] = [];
  const blendOutcomes: number[] = [];
  const perCompetition: CandidateMetrics["perCompetition"] = [];

  for (const [competition, records] of byCompetition) {
    const sorted = [...records].sort(
      (a, b) => a.playedAt.getTime() - b.playedAt.getTime(),
    );
    if (sorted.length < MIN_MATCHES) continue;

    const validationStart = Math.floor(sorted.length * VALIDATION_SPLIT);
    const foldSize = Math.ceil((sorted.length - validationStart) / folds);
    let compModelBrier = 0;
    let compModelLoss = 0;
    let compMarketBrier = 0;
    let compTotal = 0;
    let compMarketTotal = 0;

    for (let fold = 0; fold < folds; fold += 1) {
      const start = validationStart + fold * foldSize;
      const end = Math.min(sorted.length, start + foldSize);
      if (start >= end) continue;
      const training = sorted.slice(0, start);
      if (training.length < MIN_MATCHES) continue;

      const ratings = fitRatings(training.map(toModelMatch), {
        asOf: now,
        halfLifeDays: params.halfLifeDays,
        ridge: params.ridge,
      });
      applyHomeAdvantage(ratings, params.homeAdvantageMode);

      for (let index = start; index < end; index += 1) {
        const row = sorted[index]!;
        const prediction = predictMatch(
          ratings,
          row.homeTeamId,
          row.awayTeamId,
        );
        const probabilities = applyTemperature(
          [prediction.home, prediction.draw, prediction.away],
          params.temperature,
        );
        const outcome = outcomeIndex(row.homeGoals, row.awayGoals);
        const modelBrier = brierScore(probabilities, outcome);
        const modelLoss = logLoss(probabilities, outcome);
        totalModelBrier += modelBrier;
        totalModelLoss += modelLoss;
        compModelBrier += modelBrier;
        compModelLoss += modelLoss;
        total += 1;
        compTotal += 1;

        const marketRecord = closingMarketFromRecord(row.odds);
        const market = marketRecord.pre.oneXtwo ?? marketRecord.oneXtwo;
        if (market) {
          const marketProbabilities = [market.home, market.draw, market.away];
          const marketBrier = brierScore(marketProbabilities, outcome);
          const marketLoss = logLoss(marketProbabilities, outcome);
          totalMarketBrier += marketBrier;
          totalMarketLoss += marketLoss;
          compMarketBrier += marketBrier;
          marketTotal += 1;
          compMarketTotal += 1;
          blendModel.push(probabilities);
          blendMarket.push(marketProbabilities);
          blendOutcomes.push(outcome);
        }
      }
    }

    if (compTotal > 0) {
      perCompetition.push({
        competition,
        sample: compTotal,
        brier: compModelBrier / compTotal,
        logLoss: compModelLoss / compTotal,
        marketBrier:
          compMarketTotal > 0 ? compMarketBrier / compMarketTotal : null,
      });
    }
  }

  const optimalWeight =
    blendModel.length > 0
      ? fitBlendWeight(
          blendModel.map((probabilities, index) => ({
            probabilities,
            outcome: blendOutcomes[index] as 0 | 1 | 2,
          })),
          blendMarket.map((probabilities, index) => ({
            probabilities,
            outcome: blendOutcomes[index] as 0 | 1 | 2,
          })),
        ).weight
      : null;

  return {
    brier: total > 0 ? totalModelBrier / total : Number.POSITIVE_INFINITY,
    logLoss: total > 0 ? totalModelLoss / total : Number.POSITIVE_INFINITY,
    marketBrier: marketTotal > 0 ? totalMarketBrier / marketTotal : null,
    marketLogLoss: marketTotal > 0 ? totalMarketLoss / marketTotal : null,
    sample: total,
    marketSample: marketTotal,
    optimalWeight,
    perCompetition,
  };
}

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  const now = new Date();
  const quick = process.env.ANALYSIS_TUNE_QUICK === "1";
  const folds = Number(process.env.ANALYSIS_TUNE_FOLDS ?? (quick ? "1" : "2"));
  const budgetMs = Number(process.env.ANALYSIS_TUNE_BUDGET_MS ?? "900000");
  const deadline = Date.now() + budgetMs;

  try {
    const rows = (await prisma.historicalMatch.findMany({
      where: {
        competitionCode: { in: TARGET_CODES },
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
        odds: true,
      },
      orderBy: { playedAt: "asc" },
    })) as HistoricalRow[];

    const byCompetition = new Map<string, HistoricalRow[]>();
    for (const row of rows) {
      const list = byCompetition.get(row.competition) ?? [];
      list.push(row);
      byCompetition.set(row.competition, list);
    }

    const halfLives = quick ? [365] : [180, 365, 730];
    const ridges = quick ? [70] : [40, 70, 120];
    const homeModes: CandidateParams["homeAdvantageMode"][] = quick
      ? ["fit"]
      : ["fit", "league"];
    const temperatures = quick ? [1] : [0.7, 1];
    const candidates: CandidateParams[] = [];
    for (const halfLifeDays of halfLives) {
      for (const ridge of ridges) {
        for (const homeAdvantageMode of homeModes) {
          for (const temperature of temperatures) {
            candidates.push({
              halfLifeDays,
              ridge,
              homeAdvantageMode,
              temperature,
            });
          }
        }
      }
    }

    console.log(
      `[tune] ${rows.length} partidos · ${byCompetition.size} ligas · ${candidates.length} candidatos · ${folds} folds`,
    );

    let best: { params: CandidateParams; metrics: CandidateMetrics } | null =
      null;
    for (let index = 0; index < candidates.length; index += 1) {
      if (Date.now() >= deadline) {
        console.warn(`[tune] presupuesto agotado tras ${index} candidatos`);
        break;
      }
      const params = candidates[index]!;
      const metrics = evaluateCandidate(byCompetition, params, now, folds);
      if (
        !best ||
        metrics.brier < best.metrics.brier ||
        (metrics.brier === best.metrics.brier &&
          metrics.logLoss < best.metrics.logLoss)
      ) {
        best = { params, metrics };
      }
      console.log(
        `[tune] ${index + 1}/${candidates.length} H=${params.halfLifeDays} R=${params.ridge} local=${params.homeAdvantageMode} T=${params.temperature} → Brier ${metrics.brier.toFixed(4)} LL ${metrics.logLoss.toFixed(4)}`,
      );
    }

    if (!best || !Number.isFinite(best.metrics.brier)) {
      throw new Error("Ningún candidato tuvo muestra suficiente.");
    }

    const champion = await prisma.modelVersion.findFirst({
      where: { state: "CHAMPION" },
      orderBy: { promotedAt: "desc" },
    });
    const weights = JSON.parse(
      readFileSync("analysis-weights.json", "utf8"),
    ) as {
      global: { modelBrier: number; marketBrier: number; sample: number };
    };
    if (!champion) {
      await prisma.modelVersion.create({
        data: {
          name: "baseline-poisson-dc-v1",
          state: "CHAMPION",
          params: {
            halfLifeDays: 365,
            ridge: 70,
            homeAdvantageMode: "fit",
            temperature: 1,
          },
          metrics: {
            brier: weights.global.modelBrier,
            marketBrier: weights.global.marketBrier,
            sample: weights.global.sample,
            source: "backtest",
          },
          promotedAt: now,
          notes: "Campeón inicial desde analysis-weights.json.",
        },
      });
    }

    await prisma.modelVersion.updateMany({
      where: { state: "CHALLENGER" },
      data: { state: "RETIRED", retiredAt: now },
    });

    const challenger = await prisma.modelVersion.create({
      data: {
        name: `challenger-${now.toISOString().slice(0, 10)}-${now.getUTCHours()}${now.getUTCMinutes()}`,
        state: "CHALLENGER",
        params: best.params,
        metrics: {
          ...best.metrics,
          folds,
          candidates: candidates.length,
          quick,
        } as unknown as Prisma.InputJsonValue,
        notes:
          "Retador generado por analysis:tune. No activo hasta promoción manual.",
      },
    });

    console.log("");
    console.log(`[tune] retador: ${challenger.name}`);
    console.log(
      `[tune] params: H=${best.params.halfLifeDays} R=${best.params.ridge} local=${best.params.homeAdvantageMode} T=${best.params.temperature}`,
    );
    console.log(
      `[tune] Brier ${best.metrics.brier.toFixed(4)} · LL ${best.metrics.logLoss.toFixed(4)} · mercado ${best.metrics.marketBrier?.toFixed(4) ?? "—"} · N=${best.metrics.sample}`,
    );
    console.log(
      `[tune] peso óptimo forward ${best.metrics.optimalWeight?.toFixed(2) ?? "—"} (producción sigue en 0)`,
    );
    console.log(
      "[tune] No se modificó el campeón ni analysis-weights.json. Promoción manual en /settings.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
