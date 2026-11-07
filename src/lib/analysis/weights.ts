/**
 * Pesos, temperaturas y referencias de backtest generados por
 * `npm run analysis:backtest`. No son constantes de diseño: salen de la
 * validación temporal y se versionan en analysis-weights.json.
 */

import weightsFile from "../../../analysis-weights.json";

export type CompetitionWeightEntry = {
  code: string | null;
  weight: number;
  temperature: number;
  calibrationApplied: boolean;
  blendApplied: boolean;
  sample: number;
  preSample: number;
  modelBrier: number;
  modelLogLoss: number;
  marketBrier: number;
  marketLogLoss: number;
  marketPreBrier: number | null;
  naiveBrier: number;
  calibratedBrier: number;
  calibratedLogLoss: number;
  blendTestSample: number;
  blendTestMarketBrier: number;
  blendTestBrier: number;
  blendImproved: boolean;
  asOf: string | null;
  hasMarketBacktest: boolean;
};

type WeightsFile = {
  version: number;
  model: string;
  holdout: { start: string; end?: string | null };
  method: Record<string, string>;
  caveat: string;
  global: {
    weight: number;
    temperature: number;
    sample: number;
    modelBrier: number;
    marketBrier: number;
    naiveBrier: number;
    blendTestSample: number;
    blendTestMarketBrier: number;
    blendTestBrier: number;
    blendImproved: boolean;
  };
  competitions: Record<
    string,
    Omit<CompetitionWeightEntry, "hasMarketBacktest">
  >;
};

export const ANALYSIS_WEIGHTS = weightsFile as unknown as WeightsFile;
export const ANALYSIS_MODEL_NAME = ANALYSIS_WEIGHTS.model;

function fallback(code: string | null): CompetitionWeightEntry {
  return {
    code,
    weight: 0,
    temperature: 1,
    calibrationApplied: false,
    blendApplied: false,
    sample: 0,
    preSample: 0,
    modelBrier: ANALYSIS_WEIGHTS.global.modelBrier,
    modelLogLoss: 0,
    marketBrier: ANALYSIS_WEIGHTS.global.marketBrier,
    marketLogLoss: 0,
    marketPreBrier: null,
    naiveBrier: ANALYSIS_WEIGHTS.global.naiveBrier,
    calibratedBrier: 0,
    calibratedLogLoss: 0,
    blendTestSample: 0,
    blendTestMarketBrier: 0,
    blendTestBrier: 0,
    blendImproved: false,
    asOf: ANALYSIS_WEIGHTS.holdout.end ?? null,
    hasMarketBacktest: false,
  };
}

export function weightForCompetition(
  competition: string,
  code?: string | null,
): CompetitionWeightEntry {
  const direct = ANALYSIS_WEIGHTS.competitions[competition];
  if (direct) return { ...direct, hasMarketBacktest: true };
  if (code) {
    const byCode = Object.values(ANALYSIS_WEIGHTS.competitions).find(
      (entry) => entry.code === code,
    );
    if (byCode) return { ...byCode, hasMarketBacktest: true };
  }
  return fallback(code ?? null);
}
