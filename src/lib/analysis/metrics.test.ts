import { describe, expect, it } from "vitest";

import {
  brierScore,
  calibration,
  outcomeIndex,
  summarize,
  summarizeBinary,
} from "./metrics";

describe("métricas 1X2", () => {
  it("asigna el resultado correcto", () => {
    expect(outcomeIndex(2, 1)).toBe(0);
    expect(outcomeIndex(1, 1)).toBe(1);
    expect(outcomeIndex(0, 1)).toBe(2);
  });

  it("da Brier cero a una predicción perfecta", () => {
    expect(brierScore([1, 0, 0], 0)).toBe(0);
    expect(brierScore([0, 1, 0], 1)).toBe(0);
  });

  it("resume acierto y pérdida", () => {
    const summary = summarize([
      { probabilities: [0.7, 0.2, 0.1], outcome: 0 },
      { probabilities: [0.2, 0.5, 0.3], outcome: 1 },
    ]);
    expect(summary.sample).toBe(2);
    expect(summary.accuracy).toBe(1);
    expect(summary.brier).toBeGreaterThan(0);
    expect(summary.logLoss).toBeGreaterThan(0);
  });
});

describe("métricas binarias y calibración", () => {
  it("resume totales", () => {
    const summary = summarizeBinary([
      { probability: 0.6, actual: true },
      { probability: 0.4, actual: false },
    ]);
    expect(summary.sample).toBe(2);
    expect(summary.brier).toBeCloseTo(0.16, 10);
  });

  it("agrupa calibración por bins", () => {
    const bins = calibration([
      { probability: 0.05, actual: false },
      { probability: 0.15, actual: false },
      { probability: 0.95, actual: true },
    ]);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
    expect(bins[9]?.observed).toBe(1);
  });
});
