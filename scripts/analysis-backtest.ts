import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { Prisma, PrismaClient } from "@prisma/client";

import {
  applyTemperature,
  blendProbabilities,
  fitBlendWeight,
  fitTemperature,
  naiveProbabilities,
  type ProbabilityRow,
} from "../src/lib/analysis/calibration";
import { MODEL_MARKET_CAVEAT } from "../src/lib/analysis/constants";
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
const CALIBRATION_MIN_PRIOR = 200;
const CALIBRATION_MIN_EVALUATED = 100;
const BLEND_MIN_TEST = 80;
const WEIGHTS_FILE = "analysis-weights.json";

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

type LeagueRecord = {
  playedAt: Date;
  week: string;
  model: number[];
  market: number[];
  marketPre: number[] | null;
  outcome: Outcome;
  totals: { model: number; market: number; actual: boolean } | null;
};

type CalibrationValidation = {
  sample: number;
  before: MetricSummary;
  after: MetricSummary;
  candidateTemperature: number;
  appliedTemperature: number;
  improved: boolean;
  evaluated: { record: LeagueRecord; calibrated: number[] }[];
};

type BlendValidation = {
  tuneSample: number;
  testSample: number;
  candidateWeight: number;
  appliedWeight: number;
  improved: boolean;
  market: MetricSummary;
  blend: MetricSummary;
  tuneRows: { calibrated: number[]; market: number[]; outcome: Outcome }[];
  testRows: { calibrated: number[]; market: number[]; outcome: Outcome }[];
};

type Evaluation = {
  competition: string;
  code: string;
  holdout: number;
  model: MetricSummary;
  market: MetricSummary;
  preSample: number;
  preModel: MetricSummary;
  preMarket: MetricSummary;
  preClosing: MetricSummary;
  naive: MetricSummary;
  naiveProbabilities: number[];
  totalsSample: number;
  totalsModel: { brier: number; logLoss: number };
  totalsMarket: { brier: number; logLoss: number };
  calibrationBins: ReturnType<typeof calibration>;
  calibrationValidation: CalibrationValidation;
  blendValidation: BlendValidation;
  asOf: Date;
  lastRho: number;
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

function combineSummaries(
  items: readonly { summary: MetricSummary; sample: number }[],
): MetricSummary {
  const sample = items.reduce((sum, item) => sum + item.sample, 0);
  if (sample === 0) {
    return { sample: 0, brier: 0, logLoss: 0, accuracy: 0 };
  }
  return {
    sample,
    brier:
      items.reduce((sum, item) => sum + item.summary.brier * item.sample, 0) /
      sample,
    logLoss:
      items.reduce(
        (sum, item) => sum + item.summary.logLoss * item.sample,
        0,
      ) / sample,
    accuracy:
      items.reduce(
        (sum, item) => sum + item.summary.accuracy * item.sample,
        0,
      ) / sample,
  };
}

function probabilityRows(
  records: readonly LeagueRecord[],
  key: "model" | "market" | "marketPre",
): ProbabilityRow[] {
  return records
    .map((record) => ({
      probabilities:
        key === "model" ? record.model : key === "market" ? record.market : record.marketPre,
      outcome: record.outcome,
    }))
    .filter((row): row is ProbabilityRow => row.probabilities !== null);
}

function walkForwardCalibration(
  records: readonly LeagueRecord[],
): CalibrationValidation {
  const sorted = [...records].sort(
    (a, b) => a.playedAt.getTime() - b.playedAt.getTime(),
  );
  const weeks = new Map<string, LeagueRecord[]>();
  for (const record of sorted) {
    const list = weeks.get(record.week) ?? [];
    list.push(record);
    weeks.set(record.week, list);
  }

  const prior: ProbabilityRow[] = [];
  const evaluated: { record: LeagueRecord; calibrated: number[] }[] = [];

  for (const key of [...weeks.keys()].sort()) {
    const current = weeks.get(key) ?? [];
    if (prior.length >= CALIBRATION_MIN_PRIOR) {
      const fit = fitTemperature(prior);
      for (const record of current) {
        evaluated.push({
          record,
          calibrated: applyTemperature(record.model, fit.temperature),
        });
      }
    }
    prior.push(
      ...current.map((record) => ({
        probabilities: record.model,
        outcome: record.outcome,
      })),
    );
  }

  const before = summarize(
    evaluated.map((item) => ({
      probabilities: item.record.model,
      outcome: item.record.outcome,
    })),
  );
  const after = summarize(
    evaluated.map((item) => ({
      probabilities: item.calibrated,
      outcome: item.record.outcome,
    })),
  );
  const finalFit = fitTemperature(
    sorted.map((record) => ({
      probabilities: record.model,
      outcome: record.outcome,
    })),
  );
  const improved =
    evaluated.length >= CALIBRATION_MIN_EVALUATED &&
    after.brier < before.brier &&
    after.logLoss < before.logLoss;

  return {
    sample: evaluated.length,
    before,
    after,
    candidateTemperature: finalFit.temperature,
    appliedTemperature: improved ? finalFit.temperature : 1,
    improved,
    evaluated,
  };
}

function temporalBlend(
  calibrationValidation: CalibrationValidation,
): BlendValidation {
  const rows = calibrationValidation.evaluated;
  const splitIndex = Math.floor(rows.length * 0.6);
  const tune = rows.slice(0, splitIndex);
  const test = rows.slice(splitIndex);

  const tuneRows = tune.map((item) => ({
    calibrated: item.calibrated,
    market: item.record.market,
    outcome: item.record.outcome,
  }));
  const testRows = test.map((item) => ({
    calibrated: item.calibrated,
    market: item.record.market,
    outcome: item.record.outcome,
  }));

  const fit = fitBlendWeight(
    tuneRows.map((row) => ({
      probabilities: row.calibrated,
      outcome: row.outcome,
    })),
    tuneRows.map((row) => ({
      probabilities: row.market,
      outcome: row.outcome,
    })),
  );
  const market = summarize(
    testRows.map((row) => ({
      probabilities: row.market,
      outcome: row.outcome,
    })),
  );
  const blend = summarize(
    testRows.map((row) => ({
      probabilities: blendProbabilities(
        row.calibrated,
        row.market,
        fit.weight,
      ),
      outcome: row.outcome,
    })),
  );
  const improved =
    testRows.length >= BLEND_MIN_TEST && blend.brier < market.brier;
  const appliedWeight = improved ? fit.weight : 0;

  return {
    tuneSample: tuneRows.length,
    testSample: testRows.length,
    candidateWeight: fit.weight,
    appliedWeight,
    improved,
    market,
    blend:
      appliedWeight === fit.weight
        ? blend
        : summarize(
            testRows.map((row) => ({
              probabilities: row.market,
              outcome: row.outcome,
            })),
          ),
    tuneRows,
    testRows,
  };
}

function evaluateLeague(
  competitionRows: Row[],
  code: string,
): Evaluation | null {
  const competition = competitionRows[0]!.competition;
  const holdout = competitionRows.filter(
    (row) =>
      row.playedAt >= HOLD_OUT_START &&
      closingMarketFromRecord(row.odds).oneXtwo !== null,
  );
  if (holdout.length === 0) {
    console.warn(`[skip] ${code}: sin partidos de holdout con cuotas`);
    return null;
  }

  const weeks = new Map<string, Row[]>();
  for (const row of holdout) {
    const key = weekStart(row.playedAt);
    const list = weeks.get(key) ?? [];
    list.push(row);
    weeks.set(key, list);
  }

  const records: LeagueRecord[] = [];
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
      records.push({
        playedAt: row.playedAt,
        week: key,
        model: [prediction.home, prediction.draw, prediction.away],
        market: [
          market.oneXtwo.home,
          market.oneXtwo.draw,
          market.oneXtwo.away,
        ],
        marketPre: market.pre.oneXtwo
          ? [
              market.pre.oneXtwo.home,
              market.pre.oneXtwo.draw,
              market.pre.oneXtwo.away,
            ]
          : null,
        outcome,
        totals: market.totals
          ? {
              model: prediction.over25,
              market: market.totals.over25,
              actual: row.homeGoals + row.awayGoals >= 3,
            }
          : null,
      });
    }
  }

  if (records.length === 0) {
    console.warn(`[skip] ${code}: holdout sin predicciones`);
    return null;
  }

  const model = summarize(probabilityRows(records, "model"));
  const market = summarize(probabilityRows(records, "market"));
  const preRecords = records.filter((record) => record.marketPre !== null);
  const preModel = summarize(probabilityRows(preRecords, "model"));
  const preMarket = summarize(probabilityRows(preRecords, "marketPre"));
  const preClosing = summarize(probabilityRows(preRecords, "market"));

  const trainingOutcomes = competitionRows
    .filter((row) => row.playedAt < HOLD_OUT_START)
    .map((row) => outcomeIndex(row.homeGoals, row.awayGoals));
  const naive = naiveProbabilities(trainingOutcomes);
  const naiveSummary = summarize(
    records.map((record) => ({
      probabilities: naive,
      outcome: record.outcome,
    })),
  );

  const calibrationValidation = walkForwardCalibration(records);
  const blendValidation = temporalBlend(calibrationValidation);

  const totalsRecords = records.filter(
    (record): record is LeagueRecord & {
      totals: { model: number; market: number; actual: boolean };
    } => record.totals !== null,
  );

  const calibrationBins = calibration(
    records.flatMap((record) =>
      record.model.map((probability, index) => ({
        probability,
        actual: record.outcome === index,
      })),
    ),
  );

  console.log(
    `[fit] ${code} ${pad(competition, 28)} holdout=${records.length} semanas=${weeks.size - skippedWeeks} rho=${(previousRatings?.rho ?? 0).toFixed(3)} T=${calibrationValidation.appliedTemperature.toFixed(2)} w=${blendValidation.appliedWeight.toFixed(2)}`,
  );

  return {
    competition,
    code,
    holdout: records.length,
    model,
    market,
    preSample: preRecords.length,
    preModel,
    preMarket,
    preClosing,
    naive: naiveSummary,
    naiveProbabilities: naive,
    totalsSample: totalsRecords.length,
    totalsModel: summarizeBinary(
      totalsRecords.map((record) => ({
        probability: record.totals.model,
        actual: record.totals.actual,
      })),
    ),
    totalsMarket: summarizeBinary(
      totalsRecords.map((record) => ({
        probability: record.totals.market,
        actual: record.totals.actual,
      })),
    ),
    calibrationBins,
    calibrationValidation,
    blendValidation,
    asOf: holdout[holdout.length - 1]!.playedAt,
    lastRho: previousRatings?.rho ?? 0,
  };
}

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
  for (const code of TARGET_CODES) {
    const competitionRows = byCompetition.get(code);
    if (!competitionRows || competitionRows.length === 0) {
      console.warn(`[skip] ${code}: sin partidos importados`);
      continue;
    }
    const evaluation = evaluateLeague(competitionRows, code);
    if (!evaluation) continue;
    evaluations.push(evaluation);

    await prisma.modelEvaluation.upsert({
      where: {
        competition_model_asOf: {
          competition: evaluation.competition,
          model: MODEL_NAME,
          asOf: evaluation.asOf,
        },
      },
      create: {
        competition: evaluation.competition,
        model: MODEL_NAME,
        asOf: evaluation.asOf,
        sample: evaluation.holdout,
        brier: evaluation.model.brier,
        logLoss: evaluation.model.logLoss,
        baselineBrier: evaluation.market.brier,
        baselineLogLoss: evaluation.market.logLoss,
        preSample: evaluation.preSample,
        baselinePreBrier:
          evaluation.preSample > 0 ? evaluation.preMarket.brier : null,
        baselinePreLogLoss:
          evaluation.preSample > 0 ? evaluation.preMarket.logLoss : null,
        naiveBrier: evaluation.naive.brier,
        naiveLogLoss: evaluation.naive.logLoss,
        temperature: evaluation.calibrationValidation.appliedTemperature,
        calibrationSample: evaluation.calibrationValidation.sample,
        calibratedBrier: evaluation.calibrationValidation.after.brier,
        calibratedLogLoss: evaluation.calibrationValidation.after.logLoss,
        blendWeight: evaluation.blendValidation.appliedWeight,
        blendSample: evaluation.blendValidation.testSample,
        blendBrier: evaluation.blendValidation.blend.brier,
        blendLogLoss: evaluation.blendValidation.blend.logLoss,
        calibration: evaluation.calibrationBins as unknown as Prisma.InputJsonValue,
        validation: {
          calibration: {
            candidateTemperature:
              evaluation.calibrationValidation.candidateTemperature,
            appliedTemperature:
              evaluation.calibrationValidation.appliedTemperature,
            improved: evaluation.calibrationValidation.improved,
            before: evaluation.calibrationValidation.before,
            after: evaluation.calibrationValidation.after,
          },
          blend: {
            tuneSample: evaluation.blendValidation.tuneSample,
            testSample: evaluation.blendValidation.testSample,
            candidateWeight: evaluation.blendValidation.candidateWeight,
            appliedWeight: evaluation.blendValidation.appliedWeight,
            improved: evaluation.blendValidation.improved,
            market: evaluation.blendValidation.market,
            blend: evaluation.blendValidation.blend,
          },
          preMarket: {
            sample: evaluation.preSample,
            model: evaluation.preModel,
            market: evaluation.preMarket,
            closing: evaluation.preClosing,
          },
          naive: {
            probabilities: evaluation.naiveProbabilities,
            summary: evaluation.naive,
          },
          lastRho: evaluation.lastRho,
        } as unknown as Prisma.InputJsonValue,
        params: {
          halfLifeDays: HALF_LIFE_DAYS,
          ridge: RIDGE,
          holdoutStart: HOLD_OUT_START.toISOString(),
          totalsSample: evaluation.totalsSample,
          minTrainingMatches: MIN_TRAINING_MATCHES,
          calibrationMinPrior: CALIBRATION_MIN_PRIOR,
          blendSplit: 0.6,
        } as unknown as Prisma.InputJsonValue,
      },
      update: {
        sample: evaluation.holdout,
        brier: evaluation.model.brier,
        logLoss: evaluation.model.logLoss,
        baselineBrier: evaluation.market.brier,
        baselineLogLoss: evaluation.market.logLoss,
        preSample: evaluation.preSample,
        baselinePreBrier:
          evaluation.preSample > 0 ? evaluation.preMarket.brier : null,
        baselinePreLogLoss:
          evaluation.preSample > 0 ? evaluation.preMarket.logLoss : null,
        naiveBrier: evaluation.naive.brier,
        naiveLogLoss: evaluation.naive.logLoss,
        temperature: evaluation.calibrationValidation.appliedTemperature,
        calibrationSample: evaluation.calibrationValidation.sample,
        calibratedBrier: evaluation.calibrationValidation.after.brier,
        calibratedLogLoss: evaluation.calibrationValidation.after.logLoss,
        blendWeight: evaluation.blendValidation.appliedWeight,
        blendSample: evaluation.blendValidation.testSample,
        blendBrier: evaluation.blendValidation.blend.brier,
        blendLogLoss: evaluation.blendValidation.blend.logLoss,
        calibration: evaluation.calibrationBins as unknown as Prisma.InputJsonValue,
        validation: {
          calibration: {
            candidateTemperature:
              evaluation.calibrationValidation.candidateTemperature,
            appliedTemperature:
              evaluation.calibrationValidation.appliedTemperature,
            improved: evaluation.calibrationValidation.improved,
            before: evaluation.calibrationValidation.before,
            after: evaluation.calibrationValidation.after,
          },
          blend: {
            tuneSample: evaluation.blendValidation.tuneSample,
            testSample: evaluation.blendValidation.testSample,
            candidateWeight: evaluation.blendValidation.candidateWeight,
            appliedWeight: evaluation.blendValidation.appliedWeight,
            improved: evaluation.blendValidation.improved,
            market: evaluation.blendValidation.market,
            blend: evaluation.blendValidation.blend,
          },
          preMarket: {
            sample: evaluation.preSample,
            model: evaluation.preModel,
            market: evaluation.preMarket,
            closing: evaluation.preClosing,
          },
          naive: {
            probabilities: evaluation.naiveProbabilities,
            summary: evaluation.naive,
          },
          lastRho: evaluation.lastRho,
        } as unknown as Prisma.InputJsonValue,
        params: {
          halfLifeDays: HALF_LIFE_DAYS,
          ridge: RIDGE,
          holdoutStart: HOLD_OUT_START.toISOString(),
          totalsSample: evaluation.totalsSample,
          minTrainingMatches: MIN_TRAINING_MATCHES,
          calibrationMinPrior: CALIBRATION_MIN_PRIOR,
          blendSplit: 0.6,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  if (evaluations.length === 0) {
    throw new Error("No hay datos suficientes para el backtest.");
  }

  const allEvaluatedModel = evaluations.flatMap((evaluation) =>
    probabilityRows(
      evaluation.calibrationValidation.evaluated.map((item) => item.record),
      "model",
    ),
  );

  const totalModel = combineSummaries(
    evaluations.map((evaluation) => ({
      summary: evaluation.model,
      sample: evaluation.holdout,
    })),
  );
  const totalMarket = combineSummaries(
    evaluations.map((evaluation) => ({
      summary: evaluation.market,
      sample: evaluation.holdout,
    })),
  );
  const totalNaive = combineSummaries(
    evaluations.map((evaluation) => ({
      summary: evaluation.naive,
      sample: evaluation.holdout,
    })),
  );
  const totalPreModel = combineSummaries(
    evaluations.map((evaluation) => ({
      summary: evaluation.preModel,
      sample: evaluation.preSample,
    })),
  );
  const totalPreMarket = combineSummaries(
    evaluations.map((evaluation) => ({
      summary: evaluation.preMarket,
      sample: evaluation.preSample,
    })),
  );
  const totalPreClosing = combineSummaries(
    evaluations.map((evaluation) => ({
      summary: evaluation.preClosing,
      sample: evaluation.preSample,
    })),
  );

  const totalCalibrationBefore = summarize(
    evaluations.flatMap((evaluation) =>
      evaluation.calibrationValidation.evaluated.map((item) => ({
        probabilities: item.record.model,
        outcome: item.record.outcome,
      })),
    ),
  );
  const totalCalibrationAfter = summarize(
    evaluations.flatMap((evaluation) =>
      evaluation.calibrationValidation.evaluated.map((item) => ({
        probabilities: item.calibrated,
        outcome: item.record.outcome,
      })),
    ),
  );

  const totalBlendTuneRows = evaluations.flatMap(
    (evaluation) => evaluation.blendValidation.tuneRows,
  );
  const totalBlendTestRows = evaluations.flatMap(
    (evaluation) => evaluation.blendValidation.testRows,
  );
  const globalBlendFit = fitBlendWeight(
    totalBlendTuneRows.map((row) => ({
      probabilities: row.calibrated,
      outcome: row.outcome,
    })),
    totalBlendTuneRows.map((row) => ({
      probabilities: row.market,
      outcome: row.outcome,
    })),
  );
  const totalBlendMarket = summarize(
    totalBlendTestRows.map((row) => ({
      probabilities: row.market,
      outcome: row.outcome,
    })),
  );
  const totalBlend = summarize(
    totalBlendTestRows.map((row) => ({
      probabilities: blendProbabilities(
        row.calibrated,
        row.market,
        globalBlendFit.weight,
      ),
      outcome: row.outcome,
    })),
  );
  const globalBlendImproved =
    totalBlendTestRows.length >= BLEND_MIN_TEST &&
    totalBlend.brier < totalBlendMarket.brier;
  const globalWeight = globalBlendImproved ? globalBlendFit.weight : 0;

  const totalsModel = {
    sample: evaluations.reduce((sum, item) => sum + item.totalsSample, 0),
    brier:
      evaluations.reduce(
        (sum, item) => sum + item.totalsModel.brier * item.totalsSample,
        0,
      ) / Math.max(1, evaluations.reduce((sum, item) => sum + item.totalsSample, 0)),
    logLoss:
      evaluations.reduce(
        (sum, item) => sum + item.totalsModel.logLoss * item.totalsSample,
        0,
      ) / Math.max(1, evaluations.reduce((sum, item) => sum + item.totalsSample, 0)),
  };
  const totalsMarket = {
    sample: evaluations.reduce((sum, item) => sum + item.totalsSample, 0),
    brier:
      evaluations.reduce(
        (sum, item) => sum + item.totalsMarket.brier * item.totalsSample,
        0,
      ) / Math.max(1, evaluations.reduce((sum, item) => sum + item.totalsSample, 0)),
    logLoss:
      evaluations.reduce(
        (sum, item) => sum + item.totalsMarket.logLoss * item.totalsSample,
        0,
      ) / Math.max(1, evaluations.reduce((sum, item) => sum + item.totalsSample, 0)),
  };

  console.log("");
  console.log("1X2 completo · modelo vs mercado de cierre y línea base ingenua");
  console.log(
    `${pad("Liga", 26)} ${pad("N", 6)} ${pad("Modelo", 9)} ${pad("Cierre", 9)} ${pad("Naive", 9)} ${pad("Δ mod-cierre", 12)}`,
  );
  for (const item of evaluations) {
    console.log(
      `${pad(item.competition, 26)} ${pad(String(item.holdout), 6)} ${pad(item.model.brier.toFixed(4), 9)} ${pad(item.market.brier.toFixed(4), 9)} ${pad(item.naive.brier.toFixed(4), 9)} ${pad(delta(item.model.brier, item.market.brier), 12)}`,
    );
  }
  console.log(
    `${pad("TOTAL", 26)} ${pad(String(totalModel.sample), 6)} ${pad(totalModel.brier.toFixed(4), 9)} ${pad(totalMarket.brier.toFixed(4), 9)} ${pad(totalNaive.brier.toFixed(4), 9)} ${pad(delta(totalModel.brier, totalMarket.brier), 12)}`,
  );
  console.log(
    `Acierto 1X2 modelo: ${percent(totalModel.accuracy)} · mercado: ${percent(totalMarket.accuracy)}`,
  );

  console.log("");
  console.log("Mercado pre-cierre vs cierre · mismo subconjunto con AvgH/D/A");
  console.log(
    `${pad("Liga", 26)} ${pad("Npre", 6)} ${pad("Modelo", 9)} ${pad("Pre", 9)} ${pad("Cierre", 9)} ${pad("Δ mod-pre", 11)} ${pad("Δ mod-cierre", 12)}`,
  );
  for (const item of evaluations) {
    if (item.preSample === 0) {
      console.log(
        `${pad(item.competition, 26)} ${pad("0", 6)} ${pad("—", 9)} ${pad("—", 9)} ${pad("—", 9)} ${pad("—", 11)} ${pad("—", 12)}`,
      );
      continue;
    }
    console.log(
      `${pad(item.competition, 26)} ${pad(String(item.preSample), 6)} ${pad(item.preModel.brier.toFixed(4), 9)} ${pad(item.preMarket.brier.toFixed(4), 9)} ${pad(item.preClosing.brier.toFixed(4), 9)} ${pad(delta(item.preModel.brier, item.preMarket.brier), 11)} ${pad(delta(item.preModel.brier, item.preClosing.brier), 12)}`,
    );
  }
  if (totalPreMarket.sample > 0) {
    console.log(
      `${pad("TOTAL", 26)} ${pad(String(totalPreMarket.sample), 6)} ${pad(totalPreModel.brier.toFixed(4), 9)} ${pad(totalPreMarket.brier.toFixed(4), 9)} ${pad(totalPreClosing.brier.toFixed(4), 9)} ${pad(delta(totalPreModel.brier, totalPreMarket.brier), 11)} ${pad(delta(totalPreModel.brier, totalPreClosing.brier), 12)}`,
    );
  }

  console.log("");
  console.log("Recalibración walk-forward por temperatura · 1X2");
  console.log(
    `${pad("Liga", 26)} ${pad("N", 6)} ${pad("Brier antes", 11)} ${pad("Brier después", 13)} ${pad("LL antes", 9)} ${pad("LL después", 11)} ${pad("T", 6)} ${pad("¿Aplica?", 8)}`,
  );
  for (const item of evaluations) {
    const validation = item.calibrationValidation;
    console.log(
      `${pad(item.competition, 26)} ${pad(String(validation.sample), 6)} ${pad(validation.before.brier.toFixed(4), 11)} ${pad(validation.after.brier.toFixed(4), 13)} ${pad(validation.before.logLoss.toFixed(4), 9)} ${pad(validation.after.logLoss.toFixed(4), 11)} ${pad(validation.appliedTemperature.toFixed(2), 6)} ${pad(validation.improved ? "sí" : "no", 8)}`,
    );
  }
  console.log(
    `${pad("TOTAL", 26)} ${pad(String(totalCalibrationBefore.sample), 6)} ${pad(totalCalibrationBefore.brier.toFixed(4), 11)} ${pad(totalCalibrationAfter.brier.toFixed(4), 13)} ${pad(totalCalibrationBefore.logLoss.toFixed(4), 9)} ${pad(totalCalibrationAfter.logLoss.toFixed(4), 11)}`,
  );

  console.log("");
  console.log("Mezcla modelo/mercado · validación temporal 60/40 · 1X2");
  console.log(
    `${pad("Liga", 26)} ${pad("Ntest", 6)} ${pad("Mercado", 9)} ${pad("Mezcla", 9)} ${pad("Peso", 6)} ${pad("Δ", 9)} ${pad("¿Aplica?", 8)}`,
  );
  for (const item of evaluations) {
    const validation = item.blendValidation;
    console.log(
      `${pad(item.competition, 26)} ${pad(String(validation.testSample), 6)} ${pad(validation.market.brier.toFixed(4), 9)} ${pad(validation.blend.brier.toFixed(4), 9)} ${pad(validation.appliedWeight.toFixed(2), 6)} ${pad(delta(validation.blend.brier, validation.market.brier), 9)} ${pad(validation.improved ? "sí" : "no", 8)}`,
    );
  }
  console.log(
    `${pad("TOTAL", 26)} ${pad(String(totalBlendMarket.sample), 6)} ${pad(totalBlendMarket.brier.toFixed(4), 9)} ${pad(totalBlend.brier.toFixed(4), 9)} ${pad(globalWeight.toFixed(2), 6)} ${pad(delta(totalBlend.brier, totalBlendMarket.brier), 9)} ${pad(globalBlendImproved ? "sí" : "no", 8)}`,
  );

  console.log("");
  console.log("Over/Under 2.5 · ligas con cuotas de totales");
  console.log(
    `${pad("Liga", 26)} ${pad("N", 6)} ${pad("Modelo", 9)} ${pad("Mercado", 9)} ${pad("Δ", 9)}`,
  );
  for (const item of evaluations) {
    if (item.totalsSample === 0) continue;
    console.log(
      `${pad(item.competition, 26)} ${pad(String(item.totalsSample), 6)} ${pad(item.totalsModel.brier.toFixed(4), 9)} ${pad(item.totalsMarket.brier.toFixed(4), 9)} ${pad(delta(item.totalsModel.brier, item.totalsMarket.brier), 9)}`,
    );
  }
  console.log(
    `${pad("TOTAL", 26)} ${pad(String(totalsModel.sample), 6)} ${pad(totalsModel.brier.toFixed(4), 9)} ${pad(totalsMarket.brier.toFixed(4), 9)} ${pad(delta(totalsModel.brier, totalsMarket.brier), 9)}`,
  );

  console.log("");
  console.log("Calibración 1X2 sin recalibrar (probabilidad predicha vs observada)");
  console.log(
    `${pad("Bin", 10)} ${pad("N", 6)} ${pad("Predicho", 10)} ${pad("Observado", 10)}`,
  );
  for (const bin of calibration(
    allEvaluatedModel.flatMap((row) =>
      row.probabilities.map((probability, index) => ({
        probability,
        actual: row.outcome === index,
      })),
    ),
  )) {
    if (bin.count === 0) continue;
    console.log(
      `${pad(bin.bin, 10)} ${pad(String(bin.count), 6)} ${pad(percent(bin.predicted), 10)} ${pad(percent(bin.observed), 10)}`,
    );
  }

  const weights = {
    version: 1,
    model: MODEL_NAME,
    holdout: {
      start: HOLD_OUT_START.toISOString(),
      end: evaluations
        .map((evaluation) => evaluation.asOf)
        .sort((a, b) => a.getTime() - b.getTime())
        .at(-1)
        ?.toISOString(),
    },
    method: {
      calibration: "walk-forward temperature (log-loss)",
      blend: "temporal split 60/40, grid 0.01, Brier",
      preMarket: "AvgH/D/A sin margen; PSC no usado",
    },
    caveat: MODEL_MARKET_CAVEAT,
    global: {
      weight: globalWeight,
      temperature: 1,
      sample: totalModel.sample,
      modelBrier: totalModel.brier,
      marketBrier: totalMarket.brier,
      naiveBrier: totalNaive.brier,
      blendTestSample: totalBlendMarket.sample,
      blendTestMarketBrier: totalBlendMarket.brier,
      blendTestBrier: totalBlend.brier,
      blendImproved: globalBlendImproved,
    },
    competitions: Object.fromEntries(
      evaluations.map((evaluation) => [
        evaluation.competition,
        {
          code: evaluation.code,
          weight: evaluation.blendValidation.appliedWeight,
          temperature: evaluation.calibrationValidation.appliedTemperature,
          calibrationApplied: evaluation.calibrationValidation.improved,
          blendApplied: evaluation.blendValidation.improved,
          sample: evaluation.holdout,
          preSample: evaluation.preSample,
          modelBrier: evaluation.model.brier,
          modelLogLoss: evaluation.model.logLoss,
          marketBrier: evaluation.market.brier,
          marketLogLoss: evaluation.market.logLoss,
          marketPreBrier:
            evaluation.preSample > 0 ? evaluation.preMarket.brier : null,
          naiveBrier: evaluation.naive.brier,
          calibratedBrier: evaluation.calibrationValidation.after.brier,
          calibratedLogLoss: evaluation.calibrationValidation.after.logLoss,
          blendTestSample: evaluation.blendValidation.testSample,
          blendTestMarketBrier: evaluation.blendValidation.market.brier,
          blendTestBrier: evaluation.blendValidation.blend.brier,
          blendImproved: evaluation.blendValidation.improved,
          asOf: evaluation.asOf.toISOString(),
        },
      ]),
    ),
  };

  writeFileSync(
    WEIGHTS_FILE,
    `${JSON.stringify(weights, null, 2)}\n`,
    "utf8",
  );
  console.log("");
  console.log(`Pesos y validación guardados en ${WEIGHTS_FILE}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
