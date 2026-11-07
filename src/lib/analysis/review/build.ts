import { brierScore, logLoss, type Outcome } from "@/lib/analysis/metrics";
import type { OneXTwoMarket, TotalsMarket } from "@/lib/analysis/market";
import type {
  ProbabilitySet,
  ReviewMarketRow,
  ReviewModelMarkets,
  ReviewOutcome,
  ReviewScore,
  ReviewSource,
} from "./types";

type FinalOneXTwo = { home: number; draw: number; away: number } | null;
type FinalTotals = { over25: number; under25: number } | null;

function modelSum(
  model: ReviewModelMarkets,
  keys: ("home" | "draw" | "away")[],
): number | null {
  const values = keys.map((key) => model[key]);
  return values.every((value): value is number => value !== null)
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function outcomeToIndex(outcome: ReviewOutcome): Outcome {
  if (outcome === "HOME") return 0;
  if (outcome === "DRAW") return 1;
  return 2;
}

function record(
  marketPre: number | null,
  marketClose: number | null,
  model: number | null,
  final: number | null,
): ProbabilitySet {
  return { marketPre, marketClose, model, final };
}

function sum(
  value: OneXTwoMarket | FinalOneXTwo,
  keys: ("home" | "draw" | "away")[],
): number | null {
  if (!value) return null;
  return keys.reduce((total, key) => total + value[key], 0);
}

export function buildReviewRows({
  actualOutcome,
  totalGoals,
  btts,
  marketPre,
  marketClose,
  marketTotalsPre,
  marketTotalsClose,
  model,
  final,
  finalTotals,
}: {
  actualOutcome: ReviewOutcome;
  totalGoals: number;
  btts: boolean;
  marketPre: OneXTwoMarket | null;
  marketClose: OneXTwoMarket | null;
  marketTotalsPre: TotalsMarket | null;
  marketTotalsClose: TotalsMarket | null;
  model: ReviewModelMarkets;
  final: FinalOneXTwo;
  finalTotals: FinalTotals;
}): ReviewMarketRow[] {
  const rows: ReviewMarketRow[] = [];
  const outcomes: { key: ReviewOutcome; label: string; model: number | null; final: number | null }[] = [
    { key: "HOME", label: "Local", model: model.home, final: final?.home ?? null },
    { key: "DRAW", label: "Empate", model: model.draw, final: final?.draw ?? null },
    { key: "AWAY", label: "Visitante", model: model.away, final: final?.away ?? null },
  ];

  for (const outcome of outcomes) {
    rows.push({
      key: `1X2_${outcome.key}`,
      market: "1X2",
      selection: outcome.label,
      actual: actualOutcome === outcome.key,
      probabilities: record(
        marketPre?.[outcome.key === "HOME" ? "home" : outcome.key === "DRAW" ? "draw" : "away"] ?? null,
        marketClose?.[outcome.key === "HOME" ? "home" : outcome.key === "DRAW" ? "draw" : "away"] ?? null,
        outcome.model,
        outcome.final,
      ),
    });
  }

  const doubles: { key: string; label: string; keys: ("home" | "draw" | "away")[]; actual: boolean }[] = [
    { key: "1X", label: "Local o empate", keys: ["home", "draw"], actual: actualOutcome !== "AWAY" },
    { key: "12", label: "Local o visitante", keys: ["home", "away"], actual: actualOutcome !== "DRAW" },
    { key: "X2", label: "Empate o visitante", keys: ["draw", "away"], actual: actualOutcome !== "HOME" },
  ];
  for (const double of doubles) {
    rows.push({
      key: `DC_${double.key}`,
      market: "Doble oportunidad",
      selection: double.label,
      actual: double.actual,
      probabilities: record(
        sum(marketPre, double.keys),
        sum(marketClose, double.keys),
        modelSum(model, double.keys),
        sum(final, double.keys),
      ),
    });
  }

  const totals: {
    line: number;
    overKey: "over15" | "over25" | "over35";
    overLabel: string;
    underLabel: string;
  }[] = [
    { line: 1.5, overKey: "over15", overLabel: "Más de 1.5", underLabel: "Menos de 1.5" },
    { line: 2.5, overKey: "over25", overLabel: "Más de 2.5", underLabel: "Menos de 2.5" },
    { line: 3.5, overKey: "over35", overLabel: "Más de 3.5", underLabel: "Menos de 3.5" },
  ];
  for (const total of totals) {
    const overActual = totalGoals >= Math.ceil(total.line);
    const pre =
      total.line === 2.5 ? (marketTotalsPre?.over25 ?? null) : null;
    const close =
      total.line === 2.5 ? (marketTotalsClose?.over25 ?? null) : null;
    const finalOver =
      total.line === 2.5 ? (finalTotals?.over25 ?? null) : null;
    const modelOver = model[total.overKey];
    const modelUnder = modelOver === null ? null : 1 - modelOver;
    const preUnder =
      total.line === 2.5 ? (marketTotalsPre?.under25 ?? null) : null;
    const closeUnder =
      total.line === 2.5 ? (marketTotalsClose?.under25 ?? null) : null;
    const finalUnder =
      total.line === 2.5 ? (finalTotals?.under25 ?? null) : null;

    rows.push({
      key: `OVER_${total.line}`,
      market: "Total de goles",
      selection: total.overLabel,
      actual: overActual,
      probabilities: record(pre, close, modelOver, finalOver),
    });
    rows.push({
      key: `UNDER_${total.line}`,
      market: "Total de goles",
      selection: total.underLabel,
      actual: !overActual,
      probabilities: record(preUnder, closeUnder, modelUnder, finalUnder),
    });
  }

  rows.push({
    key: "BTTS_YES",
    market: "Ambos marcan",
    selection: "Sí",
    actual: btts,
    probabilities: record(null, null, model.btts, null),
  });
  rows.push({
    key: "BTTS_NO",
    market: "Ambos marcan",
    selection: "No",
    actual: !btts,
    probabilities: record(
      null,
      null,
      model.btts === null ? null : 1 - model.btts,
      null,
    ),
  });

  return rows;
}

const SCORE_LABEL: Record<ReviewSource, string> = {
  marketPre: "Mercado pre-cierre",
  marketClose: "Mercado cierre",
  model: "Modelo",
  final: "Final mostrada",
};

export function buildScores({
  actualOutcome,
  marketPre,
  marketClose,
  model,
  final,
}: {
  actualOutcome: ReviewOutcome;
  marketPre: OneXTwoMarket | null;
  marketClose: OneXTwoMarket | null;
  model: { home: number; draw: number; away: number } | null;
  final: { home: number; draw: number; away: number } | null;
}): { scores: ReviewScore[]; closestSource: ReviewSource | null } {
  const outcome = outcomeToIndex(actualOutcome);
  const sources: { key: ReviewSource; probabilities: number[] | null }[] = [
    {
      key: "marketPre",
      probabilities: marketPre ? [marketPre.home, marketPre.draw, marketPre.away] : null,
    },
    {
      key: "marketClose",
      probabilities: marketClose ? [marketClose.home, marketClose.draw, marketClose.away] : null,
    },
    {
      key: "model",
      probabilities: model ? [model.home, model.draw, model.away] : null,
    },
    {
      key: "final",
      probabilities: final ? [final.home, final.draw, final.away] : null,
    },
  ];

  const scores: ReviewScore[] = sources.map((source) => ({
    source: source.key,
    label: SCORE_LABEL[source.key],
    brier: source.probabilities
      ? brierScore(source.probabilities, outcome)
      : null,
    logLoss: source.probabilities
      ? logLoss(source.probabilities, outcome)
      : null,
  }));

  const available = scores.filter(
    (score): score is ReviewScore & { brier: number } =>
      score.brier !== null,
  );
  const closestSource = available.length
    ? available.reduce((best, item) =>
        item.brier < best.brier ? item : best,
      ).source
    : null;

  return { scores, closestSource };
}

export function actualOutcomeFromGoals(
  homeGoals: number,
  awayGoals: number,
): ReviewOutcome {
  if (homeGoals > awayGoals) return "HOME";
  if (homeGoals === awayGoals) return "DRAW";
  return "AWAY";
}
