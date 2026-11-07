/** Métricas de evaluación para 1X2 y mercados binarios. */

export type Outcome = 0 | 1 | 2;

export type CalibrationBin = {
  bin: string;
  count: number;
  predicted: number;
  observed: number;
};

export function outcomeIndex(
  homeGoals: number,
  awayGoals: number,
): Outcome {
  if (homeGoals > awayGoals) return 0;
  if (homeGoals === awayGoals) return 1;
  return 2;
}

export function brierScore(
  probabilities: readonly number[],
  outcome: Outcome,
): number {
  let score = 0;
  for (let index = 0; index < 3; index += 1) {
    const probability = probabilities[index] ?? 0;
    const actual = index === outcome ? 1 : 0;
    score += (probability - actual) ** 2;
  }
  return score;
}

export function logLoss(
  probabilities: readonly number[],
  outcome: Outcome,
): number {
  const probability = Math.min(
    1 - 1e-15,
    Math.max(1e-15, probabilities[outcome] ?? 0),
  );
  return -Math.log(probability);
}

export function binaryBrier(probability: number, actual: boolean): number {
  return (probability - (actual ? 1 : 0)) ** 2;
}

export function binaryLogLoss(
  probability: number,
  actual: boolean,
): number {
  const value = Math.min(1 - 1e-15, Math.max(1e-15, probability));
  return -Math.log(actual ? value : 1 - value);
}

/** Calibración agrupada por probabilidad predicha (0-1). */
export function calibration(
  items: readonly { probability: number; actual: boolean }[],
  bins = 10,
): CalibrationBin[] {
  const result: CalibrationBin[] = [];
  for (let index = 0; index < bins; index += 1) {
    const from = index / bins;
    const to = (index + 1) / bins;
    const selected = items.filter((item) => {
      const probability = item.probability;
      return (
        probability >= from &&
        (index === bins - 1 ? probability <= to : probability < to)
      );
    });
    if (selected.length === 0) {
      result.push({
        bin: `${(from * 100).toFixed(0)}-${(to * 100).toFixed(0)}`,
        count: 0,
        predicted: 0,
        observed: 0,
      });
      continue;
    }
    const predicted =
      selected.reduce((sum, item) => sum + item.probability, 0) /
      selected.length;
    const observed =
      selected.reduce((sum, item) => sum + (item.actual ? 1 : 0), 0) /
      selected.length;
    result.push({
      bin: `${(from * 100).toFixed(0)}-${(to * 100).toFixed(0)}`,
      count: selected.length,
      predicted,
      observed,
    });
  }
  return result;
}

export type MetricSummary = {
  sample: number;
  brier: number;
  logLoss: number;
  accuracy: number;
};

export function summarize(
  rows: readonly { probabilities: readonly number[]; outcome: Outcome }[],
): MetricSummary {
  if (rows.length === 0) {
    return { sample: 0, brier: 0, logLoss: 0, accuracy: 0 };
  }
  let brier = 0;
  let loss = 0;
  let correct = 0;
  for (const row of rows) {
    brier += brierScore(row.probabilities, row.outcome);
    loss += logLoss(row.probabilities, row.outcome);
    let best = 0;
    for (let index = 1; index < 3; index += 1) {
      if (
        (row.probabilities[index] ?? 0) >
        (row.probabilities[best] ?? 0)
      ) {
        best = index;
      }
    }
    if (best === row.outcome) correct += 1;
  }
  return {
    sample: rows.length,
    brier: brier / rows.length,
    logLoss: loss / rows.length,
    accuracy: correct / rows.length,
  };
}

export function summarizeBinary(
  rows: readonly { probability: number; actual: boolean }[],
): { sample: number; brier: number; logLoss: number } {
  if (rows.length === 0) return { sample: 0, brier: 0, logLoss: 0 };
  let brier = 0;
  let loss = 0;
  for (const row of rows) {
    brier += binaryBrier(row.probability, row.actual);
    loss += binaryLogLoss(row.probability, row.actual);
  }
  return {
    sample: rows.length,
    brier: brier / rows.length,
    logLoss: loss / rows.length,
  };
}
