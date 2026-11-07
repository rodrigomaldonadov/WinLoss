/**
 * Recalibración por temperatura y mezcla modelo/mercado.
 *
 * La temperatura se ajusta minimizando log-loss sobre predicciones pasadas y
 * se aplica a las probabilidades 1X2. La mezcla usa validación temporal: el
 * peso se ajusta en un tramo y se evalúa en el siguiente.
 */

import { brierScore, logLoss, type Outcome } from "./metrics";

export type ProbabilityRow = {
  probabilities: number[];
  outcome: Outcome;
};

function normalize(probabilities: readonly number[]): number[] {
  const safe = probabilities.map((value) =>
    Number.isFinite(value) && value > 0 ? value : 0,
  );
  const total = safe.reduce((sum, value) => sum + value, 0);
  return total > 0 ? safe.map((value) => value / total) : [1 / 3, 1 / 3, 1 / 3];
}

/** Escala logits: T > 1 suaviza; T < 1 agudiza. */
export function applyTemperature(
  probabilities: readonly number[],
  temperature: number,
): number[] {
  const safeTemperature =
    Number.isFinite(temperature) && temperature > 0 ? temperature : 1;
  const base = normalize(probabilities);
  const powered = base.map((value) => value ** (1 / safeTemperature));
  return normalize(powered);
}

export function fitTemperature(rows: readonly ProbabilityRow[]): {
  temperature: number;
  logLoss: number;
} {
  if (rows.length < 30) {
    return {
      temperature: 1,
      logLoss:
        rows.length > 0
          ? rows.reduce(
              (sum, row) => sum + logLoss(row.probabilities, row.outcome),
              0,
            ) / rows.length
          : 0,
    };
  }

  let bestTemperature = 1;
  let bestLoss = Number.POSITIVE_INFINITY;
  for (let step = 25; step <= 250; step += 1) {
    const temperature = step / 100; // 0.25 .. 2.50
    let total = 0;
    for (const row of rows) {
      total += logLoss(
        applyTemperature(row.probabilities, temperature),
        row.outcome,
      );
    }
    const average = total / rows.length;
    if (average < bestLoss) {
      bestLoss = average;
      bestTemperature = temperature;
    }
  }
  return { temperature: bestTemperature, logLoss: bestLoss };
}

export function blendProbabilities(
  model: readonly number[],
  market: readonly number[],
  weight: number,
): number[] {
  const safeWeight = Number.isFinite(weight)
    ? Math.min(1, Math.max(0, weight))
    : 0;
  const normalizedModel = normalize(model);
  const normalizedMarket = normalize(market);
  return normalize(
    normalizedModel.map(
      (value, index) =>
        safeWeight * value +
        (1 - safeWeight) * (normalizedMarket[index] ?? 0),
    ),
  );
}

/**
 * Ajusta el peso del modelo en [0,1] minimizando Brier. 0 = solo mercado.
 * No decide si usarlo: eso lo hace la validación temporal del backtest.
 */
export function fitBlendWeight(
  modelRows: readonly ProbabilityRow[],
  marketRows: readonly ProbabilityRow[],
): { weight: number; brier: number } {
  if (modelRows.length === 0 || modelRows.length !== marketRows.length) {
    return { weight: 0, brier: 0 };
  }

  let bestWeight = 0;
  let bestBrier = Number.POSITIVE_INFINITY;
  for (let step = 0; step <= 100; step += 1) {
    const weight = step / 100;
    let total = 0;
    for (let index = 0; index < modelRows.length; index += 1) {
      const model = modelRows[index]!;
      const market = marketRows[index]!;
      total += brierScore(
        blendProbabilities(
          model.probabilities,
          market.probabilities,
          weight,
        ),
        model.outcome,
      );
    }
    const average = total / modelRows.length;
    if (average < bestBrier) {
      bestBrier = average;
      bestWeight = weight;
    }
  }
  return { weight: bestWeight, brier: bestBrier };
}

/** Frecuencias históricas local/empate/visitante con suavizado de Laplace. */
export function naiveProbabilities(
  outcomes: readonly Outcome[],
): [number, number, number] {
  const counts = [1, 1, 1];
  for (const outcome of outcomes) counts[outcome] = (counts[outcome] ?? 0) + 1;
  const total = counts.reduce((sum, value) => sum + value, 0);
  return [
    (counts[0] ?? 1) / total,
    (counts[1] ?? 1) / total,
    (counts[2] ?? 1) / total,
  ];
}
