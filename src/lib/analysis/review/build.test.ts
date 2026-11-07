import { describe, expect, it } from "vitest";

import {
  actualOutcomeFromGoals,
  buildReviewRows,
  buildScores,
} from "./build";

const model = {
  home: 0.6,
  draw: 0.25,
  away: 0.15,
  over15: 0.7,
  over25: 0.45,
  over35: 0.2,
  btts: 0.5,
};

const marketPre = {
  home: 0.5,
  draw: 0.3,
  away: 0.2,
  overround: 0.05,
};
const marketClose = {
  home: 0.52,
  draw: 0.28,
  away: 0.2,
  overround: 0.04,
};
const totalsPre = { over25: 0.52, under25: 0.48, overround: 0.04 };
const totalsClose = { over25: 0.5, under25: 0.5, overround: 0.03 };

describe("buildReviewRows", () => {
  it("marca el resultado real y expone mercado pre/cierre y modelo", () => {
    const rows = buildReviewRows({
      actualOutcome: "HOME",
      totalGoals: 2,
      btts: true,
      marketPre,
      marketClose,
      marketTotalsPre: totalsPre,
      marketTotalsClose: totalsClose,
      model,
      final: { home: 0.52, draw: 0.28, away: 0.2 },
      finalTotals: { over25: 0.5, under25: 0.5 },
    });

    const home = rows.find((row) => row.key === "1X2_HOME");
    expect(home?.actual).toBe(true);
    expect(home?.probabilities).toMatchObject({
      marketPre: 0.5,
      marketClose: 0.52,
      model: 0.6,
      final: 0.52,
    });

    const over25 = rows.find((row) => row.key === "OVER_2.5");
    expect(over25?.actual).toBe(false);
    expect(over25?.probabilities.marketPre).toBeCloseTo(0.52);
    expect(rows.find((row) => row.key === "UNDER_2.5")?.actual).toBe(true);
  });

  it("no inventa mercado para líneas 1.5/3.5 ni BTTS", () => {
    const rows = buildReviewRows({
      actualOutcome: "DRAW",
      totalGoals: 2,
      btts: true,
      marketPre,
      marketClose,
      marketTotalsPre: totalsPre,
      marketTotalsClose: totalsClose,
      model,
      final: null,
      finalTotals: null,
    });
    expect(rows.find((row) => row.key === "OVER_1.5")?.probabilities.marketPre).toBeNull();
    expect(rows.find((row) => row.key === "OVER_3.5")?.probabilities.marketClose).toBeNull();
    expect(rows.find((row) => row.key === "BTTS_YES")?.probabilities.marketPre).toBeNull();
  });
});

describe("buildScores", () => {
  it("calcula probabilidad asignada, Brier, log-loss y la fuente más cercana", () => {
    const { scores, closestSource } = buildScores({
      actualOutcome: "HOME",
      marketPre,
      marketClose,
      model,
      final: { home: 0.52, draw: 0.28, away: 0.2 },
    });
    const modelScore = scores.find((score) => score.source === "model");
    expect(modelScore?.brier).toBeCloseTo(0.245);
    expect(modelScore?.logLoss).toBeCloseTo(0.5108, 3);
    expect(closestSource).toBe("model");
  });

  it("deriva el resultado real", () => {
    expect(actualOutcomeFromGoals(2, 1)).toBe("HOME");
    expect(actualOutcomeFromGoals(1, 1)).toBe("DRAW");
    expect(actualOutcomeFromGoals(0, 2)).toBe("AWAY");
  });
});
