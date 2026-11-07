import { describe, expect, it } from "vitest";

import { weightForCompetition } from "./weights";

describe("pesos de mezcla", () => {
  it("lee el peso validado de una liga con backtest", () => {
    const laLiga = weightForCompetition("LaLiga", "SP1");
    expect(laLiga.hasMarketBacktest).toBe(true);
    expect(laLiga.weight).toBe(0);
    expect(laLiga.calibrationApplied).toBe(true);
    expect(laLiga.temperature).toBeLessThan(1);
  });

  it("usa un fallback conservador sin backtest de liga", () => {
    const peru = weightForCompetition("Liga 1", "PER1");
    expect(peru.hasMarketBacktest).toBe(false);
    expect(peru.weight).toBe(0);
    expect(peru.temperature).toBe(1);
  });

  it("no mezcla modelo y mercado si el peso es 0", () => {
    const premier = weightForCompetition("Premier League", "E0");
    expect(premier.weight).toBe(0);
    expect(premier.blendImproved).toBe(false);
  });
});
