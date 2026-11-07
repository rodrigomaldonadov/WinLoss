import { describe, expect, it } from "vitest";

import {
  pairedBootstrapCi,
  reviewForwardTest,
  summarizeForward,
  type ForwardEvaluation,
} from "./forward";

function row(
  overrides: Partial<ForwardEvaluation> = {},
): ForwardEvaluation {
  return {
    competition: "Premier League",
    competitionCode: "E0",
    outcome: 0,
    model: [0.5, 0.25, 0.25],
    market: [0.45, 0.3, 0.25],
    modelBrier: 0.63,
    marketBrier: 0.6,
    modelLogLoss: 1.04,
    marketLogLoss: 1.01,
    snapshotAt: "2026-11-01T12:00:00.000Z",
    ...overrides,
  };
}

const backtest = {
  modelBrier: 0.61,
  marketBrier: 0.58,
  competitions: {
    "Premier League": { modelBrier: 0.62, marketBrier: 0.59 },
  },
};

describe("summarizeForward", () => {
  it("agrega N y Brier por liga", () => {
    const forward = summarizeForward([
      row(),
      row({ competition: "LaLiga", competitionCode: "SP1" }),
    ]);
    expect(forward.sample).toBe(2);
    expect(forward.modelBrier).toBeCloseTo(0.63);
    expect(forward.marketBrier).toBeCloseTo(0.6);
    expect(forward.competitions).toHaveLength(2);
  });
});

describe("reviewForwardTest", () => {
  it("no concluye con muestra pequeña", () => {
    const forward = summarizeForward([row()]);
    const review = reviewForwardTest(forward, backtest);
    expect(review.alerts[0]).toContain("Muestra forward insuficiente");
    expect(review.weightChanged).toBe(false);
  });

  it("avisa si el modelo se deteriora con muestra suficiente", () => {
    const rows = Array.from({ length: 40 }, () =>
      row({ modelBrier: 0.68, marketBrier: 0.6 }),
    );
    const forward = summarizeForward(rows);
    const review = reviewForwardTest(forward, backtest, {
      rows,
      minSample: 30,
      minLeagueSample: 30,
    });
    expect(review.deterioration).toBe(true);
    expect(review.alerts.some((alert) => alert.includes("por encima"))).toBe(
      true,
    );
  });

  it("avisa si el peso óptimo deja de ser 0", () => {
    const rows = Array.from({ length: 40 }, () =>
      row({
        model: [0.8, 0.1, 0.1],
        market: [0.4, 0.3, 0.3],
        modelBrier: 0.06,
        marketBrier: 0.6,
      }),
    );
    const forward = summarizeForward(rows);
    const review = reviewForwardTest(forward, backtest, {
      rows,
      minSample: 30,
      minLeagueSample: 30,
    });
    expect(review.optimalWeight).not.toBeNull();
    expect(review.weightChanged).toBe(true);
  });

  it("calcula un bootstrap pareado determinista", () => {
    const champion = Array.from({ length: 50 }, () => 0.7);
    const challenger = Array.from({ length: 50 }, () => 0.5);
    const ci = pairedBootstrapCi(champion, challenger);
    expect(ci).not.toBeNull();
    expect(ci!.meanDiff).toBeCloseTo(0.2);
    expect(ci!.lower).toBeGreaterThan(0);
    expect(ci!.upper).toBeGreaterThan(0);
  });
});
