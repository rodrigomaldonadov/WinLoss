import { pairedBootstrapCi } from "./forward";

export type PromotionConfig = {
  minSample: number;
  minRelativeImprovement: number;
  bootstrapIterations: number;
};

export function canManageModelVersions({
  userEmail,
  adminEmail,
}: {
  userEmail?: string | null;
  adminEmail?: string | null;
}): boolean {
  const admin = adminEmail?.trim().toLowerCase();
  const user = userEmail?.trim().toLowerCase();
  return Boolean(admin && user && admin === user);
}

export type PromotionDecision = {
  eligible: boolean;
  sample: number;
  championBrier: number | null;
  challengerBrier: number | null;
  relativeImprovement: number | null;
  brierDifferenceCi: { lower: number; upper: number; meanDiff: number } | null;
  logLossNotWorse: boolean;
  reasons: string[];
};

export type VersionTransition = {
  retireId: string | null;
  promoteId: string;
  previousVersionId: string | null;
};

export function promotionPlan(
  championId: string | null,
  challengerId: string,
): VersionTransition {
  return {
    retireId: championId,
    promoteId: challengerId,
    previousVersionId: championId,
  };
}

export function rollbackPlan(
  currentChampionId: string | null,
  targetId: string,
): VersionTransition {
  return {
    retireId: currentChampionId,
    promoteId: targetId,
    previousVersionId: currentChampionId,
  };
}

export function defaultPromotionConfig(): PromotionConfig {
  return {
    minSample: Number(process.env.ANALYSIS_PROMOTION_MIN_SAMPLE ?? "300"),
    minRelativeImprovement: Number(
      process.env.ANALYSIS_PROMOTION_MIN_IMPROVEMENT ?? "0.005",
    ),
    bootstrapIterations: 1_000,
  };
}

function mean(values: readonly number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

/**
 * Regla de promoción del retador. No promueve por sí sola: devuelve la
 * elegibilidad y los motivos para que la UI/acción decida.
 */
export function evaluatePromotion(
  {
    championBrier,
    challengerBrier,
    championLogLoss,
    challengerLogLoss,
  }: {
    championBrier: readonly number[];
    challengerBrier: readonly number[];
    championLogLoss: readonly number[];
    challengerLogLoss: readonly number[];
  },
  config: PromotionConfig = defaultPromotionConfig(),
  { quick = false }: { quick?: boolean } = {},
): PromotionDecision {
  const sample = Math.min(
    championBrier.length,
    challengerBrier.length,
    championLogLoss.length,
    challengerLogLoss.length,
  );
  const reasons: string[] = [];

  if (quick) {
    reasons.push("Versión generada con tuning rápido: no es promovible.");
  }

  if (sample < config.minSample) {
    reasons.push(
      `Muestra forward insuficiente: ${sample}/${config.minSample} partidos.`,
    );
  }

  const championMean = mean(championBrier.slice(0, sample));
  const challengerMean = mean(challengerBrier.slice(0, sample));
  const championLoss = mean(championLogLoss.slice(0, sample));
  const challengerLoss = mean(challengerLogLoss.slice(0, sample));

  const relativeImprovement =
    championMean !== null && championMean > 0 && challengerMean !== null
      ? (championMean - challengerMean) / championMean
      : null;

  if (
    relativeImprovement !== null &&
    relativeImprovement < config.minRelativeImprovement
  ) {
    reasons.push(
      `Mejora de Brier ${(relativeImprovement * 100).toFixed(2)}% < ${(config.minRelativeImprovement * 100).toFixed(2)}%.`,
    );
  }

  const ci =
    sample > 0
      ? pairedBootstrapCi(
          championBrier.slice(0, sample),
          challengerBrier.slice(0, sample),
          config.bootstrapIterations,
        )
      : null;
  if (!ci || ci.lower <= 0) {
    reasons.push(
      "El intervalo bootstrap pareado del 95% no excluye 0 a favor del retador.",
    );
  }

  const logLossNotWorse =
    championLoss === null ||
    challengerLoss === null ||
    challengerLoss <= championLoss;
  if (!logLossNotWorse) {
    reasons.push("El log-loss del retador empeora frente al campeón.");
  }

  const eligible = reasons.length === 0;
  return {
    eligible,
    sample,
    championBrier: championMean,
    challengerBrier: challengerMean,
    relativeImprovement,
    brierDifferenceCi: ci,
    logLossNotWorse,
    reasons: eligible ? ["Cumple la regla de promoción."] : reasons,
  };
}
