import "server-only";

import {
  defaultPromotionConfig,
  evaluatePromotion,
  type PromotionDecision,
} from "@/lib/analysis/model-version";
import { prisma } from "@/lib/prisma";

export type ModelVersionView = {
  id: string;
  name: string;
  state: "CHAMPION" | "CHALLENGER" | "RETIRED";
  quick: boolean;
  params: unknown;
  metrics: unknown;
  notes: string | null;
  createdAt: Date;
  promotedAt: Date | null;
  retiredAt: Date | null;
  previousVersionId: string | null;
  promotion?: PromotionDecision;
};

async function promotionDecisionFor(
  versionId: string,
): Promise<PromotionDecision> {
  const [version, rows] = await Promise.all([
    prisma.modelVersion.findUnique({
      where: { id: versionId },
      select: { quick: true },
    }),
    prisma.analysisSnapshot.findMany({
      where: {
        challengerVersionId: versionId,
        evaluatedAt: { not: null },
        modelBrier: { not: null },
        challengerBrier: { not: null },
        modelLogLoss: { not: null },
        challengerLogLoss: { not: null },
      },
      select: {
        modelBrier: true,
        challengerBrier: true,
        modelLogLoss: true,
        challengerLogLoss: true,
      },
    }),
  ]);

  return evaluatePromotion(
    {
      championBrier: rows.map((row) => Number(row.modelBrier)),
      challengerBrier: rows.map((row) => Number(row.challengerBrier)),
      championLogLoss: rows.map((row) => Number(row.modelLogLoss)),
      challengerLogLoss: rows.map((row) => Number(row.challengerLogLoss)),
    },
    defaultPromotionConfig(),
    { quick: version?.quick ?? false },
  );
}

export async function getModelVersionsOverview(): Promise<{
  champion: ModelVersionView | null;
  challengers: ModelVersionView[];
  retired: ModelVersionView[];
}> {
  const versions = await prisma.modelVersion.findMany({
    orderBy: { createdAt: "desc" },
  });
  const challengers = await Promise.all(
    versions
      .filter((version) => version.state === "CHALLENGER")
      .map(async (version) => ({
        ...version,
        promotion: await promotionDecisionFor(version.id),
      })),
  );

  return {
    champion: versions.find((version) => version.state === "CHAMPION") ?? null,
    challengers,
    retired: versions.filter((version) => version.state === "RETIRED"),
  };
}

export async function getPromotionDecisionForVersion(
  versionId: string,
): Promise<PromotionDecision> {
  return promotionDecisionFor(versionId);
}
