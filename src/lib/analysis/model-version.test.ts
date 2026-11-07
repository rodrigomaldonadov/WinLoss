import { describe, expect, it } from "vitest";

import { evaluatePromotion, promotionPlan, rollbackPlan, type PromotionConfig } from "./model-version";

const config: PromotionConfig = {
  minSample: 300,
  minRelativeImprovement: 0.005,
  bootstrapIterations: 200,
};

function arrays(
  length: number,
  champion: number,
  challenger: number,
  championLoss = 1.02,
  challengerLoss = 1.0,
) {
  return {
    championBrier: Array.from({ length }, () => champion),
    challengerBrier: Array.from({ length }, () => challenger),
    championLogLoss: Array.from({ length }, () => championLoss),
    challengerLogLoss: Array.from({ length }, () => challengerLoss),
  };
}

describe("evaluatePromotion", () => {
  it("no promueve con muestra pequeña", () => {
    const decision = evaluatePromotion(arrays(20, 0.65, 0.6), config);
    expect(decision.eligible).toBe(false);
    expect(decision.reasons.some((reason) => reason.includes("insuficiente"))).toBe(
      true,
    );
  });

  it("promueve con mejora clara y log-loss no peor", () => {
    const decision = evaluatePromotion(arrays(350, 0.65, 0.6), config);
    expect(decision.eligible).toBe(true);
    expect(decision.relativeImprovement).toBeCloseTo(0.0769, 3);
    expect(decision.brierDifferenceCi?.lower).toBeGreaterThan(0);
  });

  it("no promueve si empeora el log-loss", () => {
    const decision = evaluatePromotion(
      arrays(350, 0.65, 0.6, 1.0, 1.2),
      config,
    );
    expect(decision.eligible).toBe(false);
    expect(decision.logLossNotWorse).toBe(false);
  });

  it("no promueve si la mejora es demasiado pequeña", () => {
    const decision = evaluatePromotion(arrays(350, 0.6, 0.599), config);
    expect(decision.eligible).toBe(false);
    expect(
      decision.reasons.some((reason) => reason.includes("Mejora de Brier")),
    ).toBe(true);
  });

  it("planifica promoción y rollback de versiones", () => {
    expect(promotionPlan("champion", "challenger")).toEqual({
      retireId: "champion",
      promoteId: "challenger",
      previousVersionId: "champion",
    });
    expect(rollbackPlan("current", "old")).toEqual({
      retireId: "current",
      promoteId: "old",
      previousVersionId: "current",
    });
  });
});
