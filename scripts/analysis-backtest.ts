import { existsSync, readFileSync } from "node:fs";

import { Prisma, PrismaClient } from "@prisma/client";

import { closingMarketFromRecord } from "../src/lib/analysis/market";
import {
  calibration,
  outcomeIndex,
  summarize,
  summarizeBinary,
  type MetricSummary,
  type Outcome,
} from "../src/lib/analysis/metrics";
import {
  fitRatings,
  predictMatch,
  type ModelMatch,
  type Ratings,
} from "../src/lib/analysis/model";

const TARGET_CODES = ["E0", "SP1", "I1", "D1", "F1", "BRA", "ARG"] as const;
const HOLD_OUT_START = new Date(Date.UTC(2025, 6, 24));
const MIN_TRAINING_MATCHES = 80;
const MODEL_NAME = "poisson-dc-v1";
const HALF_LIFE_DAYS = Number(process.env.ANALYSIS_HALF_LIFE ?? "365");
const RIDGE = Number(process.env.ANALYSIS_RIDGE ?? "70");

function loadEnv() {
  if (!existsSync(".env")) return;
  const text = readFileSync(".env", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match?.[1]) continue;
    process.env[match[1]] ??= (match[2] ?? "").replace(/^["']|["']$/g, "");
  }
}

type Row = {
  competition: string;
  competitionCode: string | null;
  playedAt: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  odds: Prisma.JsonValue | null;
};

function weekStart(date: Date): string {
  const copy = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    ),
  );
  const day = copy.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy.toISOString().slice(0, 10);
}

function toModelMatch(row: Row): ModelMatch {
  return {
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
    playedAt: row.playedAt,
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function delta(model: number, baseline: number): string {
  if (baseline <= 0) return "—";
  return `${(((model - baseline) / baseline) * 100).toFixed(1)}%`;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width, " ");
}

type Evaluation = {
  competition: string;
  code: string;
  holdout: number;
  model: MetricSummary;
  market: MetricSummary;
  totalsSample: number;
  totalsModel: { brier: number; logLoss: number };
  totalsMarket: { brier: number; logLoss: number };
  calibration: ReturnType<typeof calibration>;
  asOf: Date;
  lastRho: number;
};

async function main() {
  loadEnv();
  const prisma = new PrismaClient();

  const rows = (await prisma.historicalMatch.findMany({
    where: {
      competitionCode: { in: [...TARGET_CODES] },
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
  })) as Row[];

  const byCompetition = new Map<string, Row[]>();
  for (const row of rows) {
    const code = row.competitionCode ?? row.competition;
    const list = byCompetition.get(code) ?? [];
    list.push(row);
    byCompetition.set(code, list);
  }

  const evaluations: Evaluation[] = [];
  const allModel: { probabilities: number[]; outcome: Outcome }[] = [];
  const allMarket: { probabilities: number[]; outcome: Outcome }[] = [];
  const allModelProbabilities: { probability: number; actual: boolean }[] = [];
  const allTotalsModel: { probability: number; actual: boolean }[] = [];
  const allTotalsMarket: { probability: number; actual: boolean }[] = [];

  for (const code of TARGET_CODES) {
    const competitionRows = byCompetition.get(code);
    if (!competitionRows || competitionRows.length === 0) {
      console.warn(`[skip] ${code}: sin partidos importados`);
      continue;
    }
    const competition = competitionRows[0]!.competition;
    const holdout = competitionRows.filter(
      (row) =>
        row.playedAt >= HOLD_OUT_START &&
        closingMarketFromRecord(row.odds).oneXtwo !== null,
    );
    if (holdout.length === 0) {
      console.warn(`[skip] ${code}: sin partidos de holdout con cuotas`);
      continue;
    }

    const weeks = new Map<string, Row[]>();
    for (const row of holdout) {
      const key = weekStart(row.playedAt);
      const list = weeks.get(key) ?? [];
      list.push(row);
      weeks.set(key, list);
    }

    const modelRows: { probabilities: number[]; outcome: Outcome }[] = [];
    const marketRows: { probabilities: number[]; outcome: Outcome }[] = [];
    const totalsModelRows: { probability: number; actual: boolean }[] = [];
    const totalsMarketRows: { probability: number; actual: boolean }[] = [];
    const leagueProbabilities: { probability: number; actual: boolean }[] = [];
    let previousRatings: Ratings | undefined;
    let skippedWeeks = 0;

    for (const key of [...weeks.keys()].sort()) {
      const weekDate = new Date(`${key}T00:00:00.000Z`);
      const training = competitionRows.filter(
        (row) => row.playedAt < weekDate,
      );
      if (training.length < MIN_TRAINING_MATCHES) {
        skippedWeeks += 1;
        continue;
      }

      const ratings = fitRatings(training.map(toModelMatch), {
        asOf: weekDate,
        halfLifeDays: HALF_LIFE_DAYS,
        ridge: RIDGE,
        initial: previousRatings,
      });
      previousRatings = ratings;

      for (const row of weeks.get(key) ?? []) {
        const market = closingMarketFromRecord(row.odds);
        if (!market.oneXtwo) continue;

        const prediction = predictMatch(
          ratings,
          row.homeTeamId,
          row.awayTeamId,
        );
        const outcome = outcomeIndex(row.homeGoals, row.awayGoals);
        const probabilities = [
          prediction.home,
          prediction.draw,
          prediction.away,
        ];
        modelRows.push({ probabilities, outcome });
        marketRows.push({
          probabilities: [
            market.oneXtwo.home,
            market.oneXtwo.draw,
            market.oneXtwo.away,
          ],
          outcome,
        });
        for (let index = 0; index < 3; index += 1) {
          leagueProbabilities.push({
            probability: probabilities[index] ?? 0,
            actual: outcome === index,
          });
        }

        if (market.totals) {
          const over = row.homeGoals + row.awayGoals >= 3;
          totalsModelRows.push({
            probability: prediction.over25,
            actual: over,
          });
          totalsMarketRows.push({
            probability: market.totals.over25,
            actual: over,
          });
        }
      }
    }

    if (modelRows.length === 0) {
      console.warn(`[skip] ${code}: holdout sin predicciones`);
      continue;
    }

    const evaluation: Evaluation = {
      competition,
      code,
      holdout: modelRows.length,
      model: summarize(modelRows),
      market: summarize(marketRows),
      totalsSample: totalsModelRows.length,
      totalsModel: summarizeBinary(totalsModelRows),
      totalsMarket: summarizeBinary(totalsMarketRows),
      calibration: calibration(leagueProbabilities),
      asOf: holdout[holdout.length - 1]!.playedAt,
      lastRho: previousRatings?.rho ?? 0,
    };
    evaluations.push(evaluation);

    allModel.push(...modelRows);
    allMarket.push(...marketRows);
    allModelProbabilities.push(...leagueProbabilities);
    allTotalsModel.push(...totalsModelRows);
    allTotalsMarket.push(...totalsMarketRows);

    console.log(
      `[fit] ${code} ${pad(competition, 28)} holdout=${modelRows.length} semanas=${weeks.size - skippedWeeks} rho=${evaluation.lastRho.toFixed(3)}`,
    );

    await prisma.modelEvaluation.upsert({
      where: {
        competition_model_asOf: {
          competition,
          model: MODEL_NAME,
          asOf: evaluation.asOf,
        },
      },
      create: {
        competition,
        model: MODEL_NAME,
        asOf: evaluation.asOf,
        sample: evaluation.holdout,
        brier: evaluation.model.brier,
        logLoss: evaluation.model.logLoss,
        baselineBrier: evaluation.market.brier,
        baselineLogLoss: evaluation.market.logLoss,
        calibration: evaluation.calibration as unknown as Prisma.InputJsonValue,
        params: {
          halfLifeDays: HALF_LIFE_DAYS,
          ridge: RIDGE,
          holdoutStart: HOLD_OUT_START.toISOString(),
          totalsSample: evaluation.totalsSample,
        },
      },
      update: {
        sample: evaluation.holdout,
        brier: evaluation.model.brier,
        logLoss: evaluation.model.logLoss,
        baselineBrier: evaluation.market.brier,
        baselineLogLoss: evaluation.market.logLoss,
        calibration: evaluation.calibration as unknown as Prisma.InputJsonValue,
        params: {
          halfLifeDays: HALF_LIFE_DAYS,
          ridge: RIDGE,
          holdoutStart: HOLD_OUT_START.toISOString(),
          totalsSample: evaluation.totalsSample,
        },
      },
    });
  }

  if (evaluations.length === 0) {
    throw new Error("No hay datos suficientes para el backtest.");
  }

  const model = summarize(allModel);
  const market = summarize(allMarket);
  const totalsModel = summarizeBinary(allTotalsModel);
  const totalsMarket = summarizeBinary(allTotalsMarket);

  console.log("");
  console.log("Backtest 1X2 · modelo vs mercado de cierre (AvgC, sin margen)");
  console.log(
    `${pad("Liga", 26)} ${pad("N", 6)} ${pad("Brier mod", 10)} ${pad("Brier mkt", 10)} ${pad("Δ", 8)} ${pad("LogLoss mod", 12)} ${pad("LogLoss mkt", 12)} ${pad("Δ", 8)}`,
  );
  for (const item of evaluations) {
    console.log(
      `${pad(item.competition, 26)} ${pad(String(item.holdout), 6)} ${pad(item.model.brier.toFixed(4), 10)} ${pad(item.market.brier.toFixed(4), 10)} ${pad(delta(item.model.brier, item.market.brier), 8)} ${pad(item.model.logLoss.toFixed(4), 12)} ${pad(item.market.logLoss.toFixed(4), 12)} ${pad(delta(item.model.logLoss, item.market.logLoss), 8)}`,
    );
  }
  console.log(
    `${pad("TOTAL", 26)} ${pad(String(model.sample), 6)} ${pad(model.brier.toFixed(4), 10)} ${pad(market.brier.toFixed(4), 10)} ${pad(delta(model.brier, market.brier), 8)} ${pad(model.logLoss.toFixed(4), 12)} ${pad(market.logLoss.toFixed(4), 12)} ${pad(delta(model.logLoss, market.logLoss), 8)}`,
  );
  console.log(`Acierto 1X2 modelo: ${percent(model.accuracy)} · mercado: ${percent(market.accuracy)}`);

  console.log("");
  console.log("Backtest Over/Under 2.5 · ligas con cuotas de totales");
  console.log(
    `${pad("Liga", 26)} ${pad("N", 6)} ${pad("Brier mod", 10)} ${pad("Brier mkt", 10)} ${pad("Δ", 8)} ${pad("LogLoss mod", 12)} ${pad("LogLoss mkt", 12)} ${pad("Δ", 8)}`,
  );
  for (const item of evaluations) {
    if (item.totalsSample === 0) continue;
    console.log(
      `${pad(item.competition, 26)} ${pad(String(item.totalsSample), 6)} ${pad(item.totalsModel.brier.toFixed(4), 10)} ${pad(item.totalsMarket.brier.toFixed(4), 10)} ${pad(delta(item.totalsModel.brier, item.totalsMarket.brier), 8)} ${pad(item.totalsModel.logLoss.toFixed(4), 12)} ${pad(item.totalsMarket.logLoss.toFixed(4), 12)} ${pad(delta(item.totalsModel.logLoss, item.totalsMarket.logLoss), 8)}`,
    );
  }
  console.log(
    `${pad("TOTAL", 26)} ${pad(String(totalsModel.sample), 6)} ${pad(totalsModel.brier.toFixed(4), 10)} ${pad(totalsMarket.brier.toFixed(4), 10)} ${pad(delta(totalsModel.brier, totalsMarket.brier), 8)} ${pad(totalsModel.logLoss.toFixed(4), 12)} ${pad(totalsMarket.logLoss.toFixed(4), 12)} ${pad(delta(totalsModel.logLoss, totalsMarket.logLoss), 8)}`,
  );

  console.log("");
  console.log("Calibración 1X2 (probabilidad predicha vs frecuencia observada)");
  console.log(
    `${pad("Bin", 10)} ${pad("N", 6)} ${pad("Predicho", 10)} ${pad("Observado", 10)}`,
  );
  for (const bin of calibration(allModelProbabilities)) {
    if (bin.count === 0) continue;
    console.log(
      `${pad(bin.bin, 10)} ${pad(String(bin.count), 6)} ${pad(percent(bin.predicted), 10)} ${pad(percent(bin.observed), 10)}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
