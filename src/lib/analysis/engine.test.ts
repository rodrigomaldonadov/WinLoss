import { describe, expect, it } from "vitest";

import { buildAnalysis, type EngineInput } from "./engine";
import { MODEL_MARKET_CAVEAT, NO_MARKET_BASELINE_NOTE } from "./constants";
import type { CompetitionWeightEntry } from "./weights";

function weights(
  overrides: Partial<CompetitionWeightEntry> = {},
): CompetitionWeightEntry {
  return {
    code: "E0",
    weight: 0,
    temperature: 1,
    calibrationApplied: false,
    blendApplied: false,
    sample: 400,
    preSample: 400,
    modelBrier: 0.62,
    modelLogLoss: 1.04,
    marketBrier: 0.6,
    marketLogLoss: 1.0,
    marketPreBrier: 0.61,
    naiveBrier: 0.66,
    calibratedBrier: 0.61,
    calibratedLogLoss: 1.02,
    blendTestSample: 100,
    blendTestMarketBrier: 0.6,
    blendTestBrier: 0.6,
    blendImproved: false,
    asOf: "2026-11-02T12:00:00.000Z",
    hasMarketBacktest: true,
    ...overrides,
  };
}

const fixture: EngineInput["fixture"] = {
  id: "fixture-1",
  competition: "Premier League",
  competitionCode: "E0",
  kickoff: new Date("2026-11-10T20:00:00.000Z"),
  homeName: "Arsenal",
  awayName: "Chelsea",
  homeTeamId: "home",
  awayTeamId: "away",
  isDomesticLeague: true,
};

const market = {
  oneXtwo: { home: 0.5, draw: 0.25, away: 0.25 },
  totals: { over25: 0.55, under25: 0.45 },
  capturedAt: new Date("2026-11-08T10:00:00.000Z"),
  fresh: true,
  bookmakerCount: 8,
};

const model = {
  available: true,
  probabilities: {
    home: 0.45,
    draw: 0.3,
    away: 0.25,
    over25: 0.5,
    under25: 0.5,
  },
  sample: 400,
};

describe("buildAnalysis", () => {
  it("usa el mercado y deja el modelo aparte cuando el peso es 0", () => {
    const result = buildAnalysis({
      fixture,
      market,
      model,
      weights: weights(),
    });
    expect(result.final.source).toBe("market");
    expect(result.final.probabilities?.home).toBeCloseTo(0.5, 10);
    expect(result.sources.model.available).toBe(true);
    expect(result.sources.model.note).toContain(MODEL_MARKET_CAVEAT);
    expect(result.notes).toContain(MODEL_MARKET_CAVEAT);
  });

  it("mezcla solo cuando el peso validado es mayor que 0", () => {
    const result = buildAnalysis({
      fixture,
      market,
      model,
      weights: weights({ weight: 0.4 }),
    });
    expect(result.final.source).toBe("blend");
    expect(result.final.probabilities?.home).toBeCloseTo(
      0.4 * 0.45 + 0.6 * 0.5,
      10,
    );
  });

  it("sin mercado usa el modelo con confianza media e incluye la advertencia", () => {
    const result = buildAnalysis({
      fixture,
      market: { ...market, oneXtwo: null, totals: null, fresh: false },
      model,
      weights: weights(),
    });
    expect(result.final.source).toBe("model");
    expect(result.final.confidence).toBe("MEDIUM");
    expect(result.final.note).toContain(MODEL_MARKET_CAVEAT);
  });

  it("sin backtest contra mercado usa la nota de línea base ingenua", () => {
    const result = buildAnalysis({
      fixture,
      market: { ...market, oneXtwo: null, totals: null, fresh: false },
      model: { ...model, sample: 100 },
      weights: weights({ hasMarketBacktest: false }),
    });
    expect(result.final.source).toBe("model");
    expect(result.final.confidence).toBe("LOW");
    expect(result.final.note).toContain(NO_MARKET_BASELINE_NOTE);
  });

  it("aplica temperatura cuando la calibración fue validada", () => {
    const result = buildAnalysis({
      fixture,
      market: { ...market, oneXtwo: null, totals: null, fresh: false },
      model: {
        ...model,
        probabilities: {
          home: 0.8,
          draw: 0.1,
          away: 0.1,
          over25: 0.5,
          under25: 0.5,
        },
      },
      weights: weights({ calibrationApplied: true, temperature: 0.5 }),
    });
    expect(result.final.probabilities!.home).toBeGreaterThan(0.8);
  });

  it("no usa modelo en copas internacionales", () => {
    const result = buildAnalysis({
      fixture: { ...fixture, isDomesticLeague: false },
      market,
      model,
      weights: weights(),
    });
    expect(result.final.source).toBe("market");
    expect(result.sources.model.available).toBe(false);
    expect(result.sources.model.note).toBe("Modelo no disponible");
  });

  it("exige al menos 5 usuarios en comunidad", () => {
    const small = buildAnalysis({
      fixture,
      market,
      model,
      weights: weights(),
      community: {
        users: 4,
        picks: 10,
        anonymousOptIn: true,
        probabilities: { home: 0.6, draw: 0.2, away: 0.2 },
        totals: null,
      },
    });
    expect(small.sources.community.available).toBe(false);

    const enough = buildAnalysis({
      fixture,
      market,
      model,
      weights: weights(),
      community: {
        users: 5,
        picks: 10,
        anonymousOptIn: true,
        probabilities: { home: 0.6, draw: 0.2, away: 0.2 },
        totals: null,
      },
    });
    expect(enough.sources.community.available).toBe(true);
    expect(enough.sources.community.confidence).toBe("LOW");
  });

  it("devuelve insuficiente si no hay mercado ni modelo", () => {
    const result = buildAnalysis({
      fixture,
      market: { ...market, oneXtwo: null, totals: null, fresh: false },
      model: { ...model, available: false, probabilities: null, sample: 0 },
      weights: weights(),
    });
    expect(result.final.available).toBe(false);
    expect(result.final.source).toBe("none");
    expect(result.final.confidence).toBe("INSUFFICIENT");
  });
});
