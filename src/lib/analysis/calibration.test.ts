import { describe, expect, it } from "vitest";

import {
  applyTemperature,
  blendProbabilities,
  fitBlendWeight,
  fitTemperature,
  naiveProbabilities,
} from "./calibration";

describe("temperatura", () => {
  it("normaliza y suaviza con T > 1", () => {
    const calibrated = applyTemperature([0.8, 0.15, 0.05], 2);
    expect(calibrated.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
    expect(calibrated[0]).toBeLessThan(0.8);
    expect(calibrated[0]).toBeGreaterThan(calibrated[1]!);
  });

  it("agudiza con T < 1", () => {
    const calibrated = applyTemperature([0.6, 0.3, 0.1], 0.5);
    expect(calibrated[0]).toBeGreaterThan(0.6);
  });

  it("encuentra una temperatura que mejora el log-loss", () => {
    const rows = [
      { probabilities: [0.9, 0.05, 0.05], outcome: 0 as const },
      { probabilities: [0.7, 0.2, 0.1], outcome: 1 as const },
      { probabilities: [0.6, 0.2, 0.2], outcome: 1 as const },
      { probabilities: [0.8, 0.1, 0.1], outcome: 2 as const },
    ];
    const repeated = Array.from({ length: 40 }, (_, index) => rows[index % rows.length]!);
    const fit = fitTemperature(repeated);
    expect(fit.temperature).toBeGreaterThan(1);
  });
});

describe("mezcla", () => {
  it("interpola modelo y mercado", () => {
    const blended = blendProbabilities([1, 0, 0], [0, 0, 1], 0.25);
    expect(blended).toEqual([0.25, 0, 0.75]);
  });

  it("elige el peso que minimiza Brier", () => {
    const model = [
      { probabilities: [1, 0, 0], outcome: 0 as const },
      { probabilities: [1, 0, 0], outcome: 0 as const },
    ];
    const market = [
      { probabilities: [0, 0, 1], outcome: 0 as const },
      { probabilities: [0, 0, 1], outcome: 0 as const },
    ];
    expect(fitBlendWeight(model, market).weight).toBe(1);
  });
});

describe("línea base ingenua", () => {
  it("usa frecuencias con suavizado", () => {
    const probabilities = naiveProbabilities([0, 0, 0, 1, 2]);
    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
    expect(probabilities[0]).toBeGreaterThan(probabilities[1]!);
  });
});
