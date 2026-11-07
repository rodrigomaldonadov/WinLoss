import { fitBlendWeight } from "./calibration";
import { brierScore, logLoss, type Outcome } from "./metrics";

export type ForwardEvaluation = {
  competition: string;
  competitionCode: string | null;
  outcome: Outcome;
  model: [number, number, number] | null;
  market: [number, number, number] | null;
  modelBrier: number | null;
  marketBrier: number | null;
  modelLogLoss: number | null;
  marketLogLoss: number | null;
  snapshotAt: string;
};

export function parseProbabilityTriple(
  value: unknown,
): [number, number, number] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const home = record.home;
  const draw = record.draw;
  const away = record.away;
  if (
    typeof home !== "number" ||
    typeof draw !== "number" ||
    typeof away !== "number"
  ) {
    return null;
  }
  return [home, draw, away];
}

export function mapSnapshotToForward(row: {
  competition: string;
  competitionCode: string | null;
  outcome: number | null;
  modelProbability: unknown;
  marketProbability: unknown;
  modelBrier: unknown;
  marketBrier: unknown;
  modelLogLoss: unknown;
  marketLogLoss: unknown;
  snapshotAt: Date;
}): ForwardEvaluation | null {
  if (row.outcome !== 0 && row.outcome !== 1 && row.outcome !== 2) {
    return null;
  }
  const numberOrNull = (value: unknown) =>
    typeof value === "number" ? value : null;
  return {
    competition: row.competition,
    competitionCode: row.competitionCode,
    outcome: row.outcome,
    model: parseProbabilityTriple(row.modelProbability),
    market: parseProbabilityTriple(row.marketProbability),
    modelBrier: numberOrNull(row.modelBrier),
    marketBrier: numberOrNull(row.marketBrier),
    modelLogLoss: numberOrNull(row.modelLogLoss),
    marketLogLoss: numberOrNull(row.marketLogLoss),
    snapshotAt: row.snapshotAt.toISOString(),
  };
}

export type ForwardMetricSummary = {
  sample: number;
  modelSample: number;
  marketSample: number;
  modelBrier: number | null;
  marketBrier: number | null;
  modelLogLoss: number | null;
  marketLogLoss: number | null;
};

export type ForwardAccuracy = ForwardMetricSummary & {
  since: string | null;
  competitions: Array<
    ForwardMetricSummary & {
      competition: string;
      code: string | null;
    }
  >;
};

export type BacktestReference = {
  modelBrier: number;
  marketBrier: number;
  competitions: Record<
    string,
    { modelBrier: number; marketBrier: number }
  >;
};

export type ForwardReview = {
  sample: number;
  deterioration: boolean;
  weightChanged: boolean;
  optimalWeight: number | null;
  alerts: string[];
  recommendations: string[];
};

function average(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function metricSummary(rows: ForwardEvaluation[]): ForwardMetricSummary {
  const modelBrier = rows
    .map((row) =>
      row.modelBrier ??
      (row.model ? brierScore(row.model, row.outcome) : null),
    )
    .filter((value): value is number => typeof value === "number");
  const marketBrier = rows
    .map((row) =>
      row.marketBrier ??
      (row.market ? brierScore(row.market, row.outcome) : null),
    )
    .filter((value): value is number => typeof value === "number");
  const modelLogLoss = rows
    .map((row) =>
      row.modelLogLoss ??
      (row.model ? logLoss(row.model, row.outcome) : null),
    )
    .filter((value): value is number => typeof value === "number");
  const marketLogLoss = rows
    .map((row) =>
      row.marketLogLoss ??
      (row.market ? logLoss(row.market, row.outcome) : null),
    )
    .filter((value): value is number => typeof value === "number");

  return {
    sample: rows.length,
    modelSample: modelBrier.length,
    marketSample: marketBrier.length,
    modelBrier: average(modelBrier),
    marketBrier: average(marketBrier),
    modelLogLoss: average(modelLogLoss),
    marketLogLoss: average(marketLogLoss),
  };
}

export function summarizeForward(
  rows: readonly ForwardEvaluation[],
): ForwardAccuracy {
  const overall = metricSummary([...rows]);
  const byCompetition = new Map<string, ForwardEvaluation[]>();
  for (const row of rows) {
    const list = byCompetition.get(row.competition) ?? [];
    list.push(row);
    byCompetition.set(row.competition, list);
  }

  const competitions = [...byCompetition.entries()]
    .map(([competition, values]) => {
      const summary = metricSummary(values);
      return {
        competition,
        code: values[0]?.competitionCode ?? null,
        ...summary,
      };
    })
    .sort((a, b) => b.sample - a.sample || a.competition.localeCompare(b.competition));

  const since = rows
    .map((row) => row.snapshotAt)
    .sort((a, b) => a.localeCompare(b))[0] ?? null;

  return { ...overall, since, competitions };
}

/** LCG determinista para que el bootstrap sea reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Intervalo bootstrap pareado al 95% para la diferencia de Brier
 * champion - challenger. Positivo = challenger mejor.
 */
export function pairedBootstrapCi(
  champion: readonly number[],
  challenger: readonly number[],
  iterations = 1000,
): { lower: number; upper: number; meanDiff: number } | null {
  const length = Math.min(champion.length, challenger.length);
  if (length < 2) return null;
  const differences = Array.from(
    { length },
    (_, index) => champion[index]! - challenger[index]!,
  );
  const meanDiff =
    differences.reduce((sum, value) => sum + value, 0) / length;
  const random = seededRandom(0x51ed270b);
  const means: number[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let index = 0; index < length; index += 1) {
      total += differences[Math.floor(random() * length)]!;
    }
    means.push(total / length);
  }
  means.sort((a, b) => a - b);
  const lower = means[Math.floor(iterations * 0.025)] ?? meanDiff;
  const upper = means[Math.floor(iterations * 0.975)] ?? meanDiff;
  return { lower, upper, meanDiff };
}

export function reviewForwardTest(
  forward: ForwardAccuracy,
  backtest: BacktestReference,
  {
    minSample = 300,
    minLeagueSample = 30,
    deteriorationAbs = 0.02,
    weightThreshold = 0.05,
    rows = [],
  }: {
    minSample?: number;
    minLeagueSample?: number;
    deteriorationAbs?: number;
    weightThreshold?: number;
    rows?: readonly ForwardEvaluation[];
  } = {},
): ForwardReview {
  const alerts: string[] = [];
  const recommendations: string[] = [];
  let deterioration = false;

  if (forward.sample < minSample) {
    alerts.push(
      `Muestra forward insuficiente: N=${forward.sample}; mínimo ${minSample}.`,
    );
    recommendations.push(
      "Seguir acumulando partidos antes de cambiar pesos o parámetros.",
    );
  }

  if (
    forward.sample >= minSample &&
    forward.modelBrier !== null &&
    forward.modelBrier > backtest.modelBrier + deteriorationAbs
  ) {
    deterioration = true;
    alerts.push(
      `El modelo forward (${forward.modelBrier.toFixed(4)}) está por encima del backtest (${backtest.modelBrier.toFixed(4)}).`,
    );
  }

  for (const competition of forward.competitions) {
    const reference = backtest.competitions[competition.competition];
    if (
      competition.sample >= minLeagueSample &&
      reference &&
      competition.modelBrier !== null &&
      competition.modelBrier > reference.modelBrier + deteriorationAbs
    ) {
      deterioration = true;
      alerts.push(
        `${competition.competition}: forward ${competition.modelBrier.toFixed(4)} vs backtest ${reference.modelBrier.toFixed(4)}.`,
      );
    }
  }

  let optimalWeight: number | null = null;
  const paired = rows.filter(
    (row) => row.model !== null && row.market !== null,
  );
  if (paired.length > 0) {
    const fit = fitBlendWeight(
      paired.map((row) => ({
        probabilities: row.model!,
        outcome: row.outcome,
      })),
      paired.map((row) => ({
        probabilities: row.market!,
        outcome: row.outcome,
      })),
    );
    optimalWeight = fit.weight;
  }

  const weightChanged =
    optimalWeight !== null &&
    forward.sample >= minSample &&
    optimalWeight > weightThreshold;
  if (weightChanged) {
    alerts.push(
      `El peso óptimo forward del modelo es ${optimalWeight!.toFixed(2)} (> ${weightThreshold}); el peso de producción sigue en 0.`,
    );
  }

  if (
    forward.modelBrier !== null &&
    forward.marketBrier !== null &&
    forward.marketBrier <= forward.modelBrier
  ) {
    recommendations.push(
      "Mantener el mercado como fuente principal y el peso del modelo en 0.",
    );
  } else if (forward.modelBrier !== null) {
    recommendations.push(
      "El modelo forward supera al mercado en esta muestra; revisar con la regla de promoción antes de cambiar nada.",
    );
  }

  recommendations.push(
    "No se modificaron parámetros automáticamente. Cualquier cambio requiere promoción explícita.",
  );

  return {
    sample: forward.sample,
    deterioration,
    weightChanged,
    optimalWeight,
    alerts,
    recommendations,
  };
}
