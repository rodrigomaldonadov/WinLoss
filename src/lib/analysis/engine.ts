import { applyTemperature, blendProbabilities } from "./calibration";
import {
  INSUFFICIENT_DATA_LABEL,
  INTERNATIONAL_MODEL_LABEL,
  MODEL_MARKET_CAVEAT,
  NO_MARKET_BASELINE_NOTE,
} from "./constants";
import type { CompetitionWeightEntry } from "./weights";

export type AnalysisConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export type AnalysisSourceKey = "market" | "model" | "community" | "private";
export type AnalysisFinalSource = "market" | "model" | "blend" | "none";

export type Triple = { home: number; draw: number; away: number };
export type Totals = { over25: number; under25: number };
export type ModelProbabilities = Triple & Totals & { btts?: number };

export type FixtureInput = {
  id: string;
  competition: string;
  competitionCode: string | null;
  kickoff: Date;
  homeName: string;
  awayName: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  isDomesticLeague: boolean;
};

export type MarketInput = {
  oneXtwo: Triple | null;
  totals: Totals | null;
  capturedAt: Date | null;
  fresh: boolean;
  bookmakerCount?: number;
};

export type ModelInput = {
  available: boolean;
  probabilities: ModelProbabilities | null;
  sample: number;
};

export type CommunityInput = {
  users: number;
  picks: number;
  anonymousOptIn: boolean;
  probabilities: Triple | null;
  totals: Totals | null;
  excludedUsers?: number;
};

export type PrivateInput = {
  picks: number;
  probabilities: Triple | null;
  totals: Totals | null;
};

export type SourceView = {
  key: AnalysisSourceKey;
  label: string;
  available: boolean;
  confidence: AnalysisConfidence;
  probabilities: Triple | null;
  totals: Totals | null;
  btts?: number | null;
  sample: number | null;
  note: string | null;
};

export type AnalysisResult = {
  fixture: FixtureInput;
  final: {
    available: boolean;
    source: AnalysisFinalSource;
    probabilities: Triple | null;
    totals: Totals | null;
    confidence: AnalysisConfidence;
    weight: number;
    temperature: number;
    note: string;
  };
  sources: Record<AnalysisSourceKey, SourceView>;
  reference: {
    hasMarketBacktest: boolean;
    sample: number;
    modelBrier: number;
    marketBrier: number;
    marketPreBrier: number | null;
    naiveBrier: number;
    asOf: string | null;
  };
  notes: string[];
};

export type EngineInput = {
  fixture: FixtureInput;
  market: MarketInput;
  model: ModelInput;
  community?: CommunityInput | null;
  private?: PrivateInput | null;
  weights: CompetitionWeightEntry;
  now?: Date;
};

function normalizeTriple(probabilities: Triple): Triple {
  const total = probabilities.home + probabilities.draw + probabilities.away;
  if (!(total > 0)) {
    return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  }
  return {
    home: probabilities.home / total,
    draw: probabilities.draw / total,
    away: probabilities.away / total,
  };
}

function valuesToTriple(values: readonly number[]): Triple {
  return {
    home: values[0] ?? 0,
    draw: values[1] ?? 0,
    away: values[2] ?? 0,
  };
}

function modelConfidence(
  sample: number,
  hasMarketBacktest: boolean,
): AnalysisConfidence {
  if (sample >= 200 && hasMarketBacktest) return "MEDIUM";
  if (sample > 0) return "LOW";
  return "INSUFFICIENT";
}

export function buildAnalysis(input: EngineInput): AnalysisResult {
  const { fixture, market, model, weights } = input;
  const notes: string[] = [];

  const marketAvailable = Boolean(
    market.fresh && market.oneXtwo && !Number.isNaN(market.oneXtwo.home),
  );
  const marketProbability = marketAvailable
    ? normalizeTriple(market.oneXtwo!)
    : null;

  const modelEligible = fixture.isDomesticLeague && model.available;
  const modelProbability = modelEligible
    ? model.probabilities
      ? normalizeTriple(model.probabilities)
      : null
    : null;
  const calibratedModelProbability = modelProbability
    ? normalizeTriple(
        valuesToTriple(
          applyTemperature(
            [
              modelProbability.home,
              modelProbability.draw,
              modelProbability.away,
            ],
            weights.calibrationApplied ? weights.temperature : 1,
          ),
        ),
      )
    : null;

  const modelTotals =
    modelEligible && model.probabilities
      ? {
          over25: model.probabilities.over25,
          under25: model.probabilities.under25,
        }
      : null;

  const modelNote = !fixture.isDomesticLeague
    ? INTERNATIONAL_MODEL_LABEL
    : !model.available || !calibratedModelProbability
      ? INSUFFICIENT_DATA_LABEL
      : weights.hasMarketBacktest
        ? MODEL_MARKET_CAVEAT
        : NO_MARKET_BASELINE_NOTE;

  if (calibratedModelProbability && weights.hasMarketBacktest) {
    notes.push(MODEL_MARKET_CAVEAT);
  } else if (calibratedModelProbability) {
    notes.push(NO_MARKET_BASELINE_NOTE);
  }

  const community = input.community ?? null;
  const communityAvailable = Boolean(
    community &&
      community.anonymousOptIn &&
      community.users >= 5 &&
      community.probabilities,
  );
  const communityProbability = communityAvailable
    ? normalizeTriple(community!.probabilities!)
    : null;

  const privateAnalysis = input.private ?? null;
  const privateAvailable = Boolean(
    privateAnalysis && privateAnalysis.picks > 0 && privateAnalysis.probabilities,
  );

  const sources: Record<AnalysisSourceKey, SourceView> = {
    market: {
      key: "market",
      label: "Mercado",
      available: marketAvailable,
      confidence: marketAvailable ? "HIGH" : "INSUFFICIENT",
      probabilities: marketProbability,
      totals: marketAvailable ? market.totals : null,
      sample: market.bookmakerCount ?? null,
      note: marketAvailable
        ? "Promedio de cierre sin margen"
        : market.capturedAt
          ? "Cuotas caducadas o incompletas"
          : "Sin cuotas para este partido",
    },
    model: {
      key: "model",
      label: "Modelo estadístico",
      available: Boolean(calibratedModelProbability),
      confidence: calibratedModelProbability
        ? modelConfidence(model.sample, weights.hasMarketBacktest)
        : "INSUFFICIENT",
      probabilities: calibratedModelProbability,
      totals: modelTotals,
      btts: modelEligible ? (model.probabilities?.btts ?? null) : null,
      sample: model.sample,
      note: modelNote,
    },
    community: {
      key: "community",
      label: "Comunidad",
      available: communityAvailable,
      confidence: communityAvailable ? "LOW" : "INSUFFICIENT",
      probabilities: communityProbability,
      totals: communityAvailable ? (community?.totals ?? null) : null,
      sample: community?.users ?? null,
      note: communityAvailable
        ? "Agregado anónimo de usuarios con picks"
        : community
          ? `Muestra insuficiente (${community.users} usuarios; mínimo 5)`
          : "Sin picks de la comunidad",
    },
    private: {
      key: "private",
      label: "Tu historial",
      available: privateAvailable,
      confidence: privateAvailable ? "LOW" : "INSUFFICIENT",
      probabilities: privateAvailable
        ? normalizeTriple(privateAnalysis!.probabilities!)
        : null,
      totals: privateAvailable ? (privateAnalysis?.totals ?? null) : null,
      sample: privateAnalysis?.picks ?? null,
      note: privateAvailable
        ? "Tus picks registrados para este partido"
        : "Sin historial propio para este partido",
    },
  };

  const blendWeight = marketAvailable && calibratedModelProbability
    ? weights.weight
    : 0;

  let source: AnalysisFinalSource = "none";
  let finalProbability: Triple | null = null;
  let finalTotals: Totals | null = null;
  let confidence: AnalysisConfidence = "INSUFFICIENT";
  let note = INSUFFICIENT_DATA_LABEL;

  if (marketAvailable && calibratedModelProbability && blendWeight > 0) {
    source = "blend";
    finalProbability = normalizeTriple(
      valuesToTriple(
        blendProbabilities(
          [
            calibratedModelProbability.home,
            calibratedModelProbability.draw,
            calibratedModelProbability.away,
          ],
          [
            marketProbability!.home,
            marketProbability!.draw,
            marketProbability!.away,
          ],
          blendWeight,
        ),
      ),
    );
    finalTotals = market.totals ?? modelTotals;
    confidence = "HIGH";
    note = `Mezcla validada: ${Math.round(blendWeight * 100)}% modelo / ${Math.round((1 - blendWeight) * 100)}% mercado`;
  } else if (marketAvailable) {
    source = "market";
    finalProbability = marketProbability;
    finalTotals = market.totals;
    confidence = "HIGH";
    note =
      calibratedModelProbability && weights.weight === 0
        ? "Mercado como fuente principal; el modelo se muestra aparte porque no mejoró la mezcla"
        : "Mercado como fuente principal";
  } else if (calibratedModelProbability) {
    source = "model";
    finalProbability = calibratedModelProbability;
    finalTotals = modelTotals;
    confidence = modelConfidence(model.sample, weights.hasMarketBacktest);
    note = fixture.isDomesticLeague
      ? weights.hasMarketBacktest
        ? `${MODEL_MARKET_CAVEAT}. Sin mercado disponible.`
        : `${NO_MARKET_BASELINE_NOTE}. Sin mercado disponible.`
      : INTERNATIONAL_MODEL_LABEL;
  }

  if (
    fixture.isDomesticLeague &&
    !calibratedModelProbability &&
    !marketAvailable &&
    communityAvailable
  ) {
    notes.push("Solo hay picks de la comunidad; no se calcula probabilidad final.");
  }

  return {
    fixture,
    final: {
      available: Boolean(finalProbability),
      source,
      probabilities: finalProbability,
      totals: finalTotals,
      confidence,
      weight: blendWeight,
      temperature: weights.calibrationApplied ? weights.temperature : 1,
      note,
    },
    sources,
    reference: {
      hasMarketBacktest: weights.hasMarketBacktest,
      sample: weights.sample,
      modelBrier: weights.modelBrier,
      marketBrier: weights.marketBrier,
      marketPreBrier: weights.marketPreBrier,
      naiveBrier: weights.naiveBrier,
      asOf: weights.asOf,
    },
    notes,
  };
}
