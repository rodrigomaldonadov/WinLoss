import { describe, expect, it } from "vitest";

import {
  closingMarketFromRecord,
  market1x2,
  marketTotals,
  removeMargin,
} from "./market";

describe("removeMargin", () => {
  it("normaliza probabilidades y elimina el margen", () => {
    const probabilities = removeMargin([2, 4, 4]);
    expect(probabilities).toEqual([0.5, 0.25, 0.25]);
  });

  it("rechaza cuotas inválidas", () => {
    expect(removeMargin([1, 2, 3])).toBeNull();
    expect(removeMargin([0, 2, 3])).toBeNull();
  });
});

describe("mercados de cierre", () => {
  it("convierte cuotas 1X2", () => {
    const market = market1x2(1.8, 3.5, 4.2);
    expect(market).not.toBeNull();
    expect(market!.home).toBeGreaterThan(market!.draw);
    expect(market!.home + market!.draw + market!.away).toBeCloseTo(1, 10);
    expect(market!.overround).toBeGreaterThan(0);
  });

  it("convierte totales", () => {
    const totals = marketTotals(1.7, 2.1);
    expect(totals!.over25 + totals!.under25).toBeCloseTo(1, 10);
    expect(totals!.over25).toBeGreaterThan(totals!.under25);
  });

  it("lee el JSON guardado y tolera campos ausentes", () => {
    const market = closingMarketFromRecord({
      pre: { home: 1.8, draw: 3.5, away: 4.2 },
      closing: { home: 2, draw: 4, away: 4, over25: 2, under25: 2 },
    });
    expect(market.oneXtwo?.home).toBeCloseTo(0.5, 10);
    expect(market.totals?.over25).toBeCloseTo(0.5, 10);
    expect(market.pre.oneXtwo?.home).toBeGreaterThan(market.oneXtwo!.home);

    const empty = closingMarketFromRecord(null);
    expect(empty.oneXtwo).toBeNull();
    expect(empty.totals).toBeNull();
    expect(empty.pre.oneXtwo).toBeNull();
  });
});
