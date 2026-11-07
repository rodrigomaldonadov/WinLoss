import "server-only";

import {
  mapSnapshotToForward,
  summarizeForward,
  type ForwardAccuracy,
} from "@/lib/analysis/forward";
import { prisma } from "@/lib/prisma";

/** Métricas del forward test: solo snapshots evaluados. */
export async function getForwardAccuracy(): Promise<ForwardAccuracy> {
  const rows = await prisma.analysisSnapshot.findMany({
    where: { evaluatedAt: { not: null } },
    select: {
      competition: true,
      competitionCode: true,
      outcome: true,
      modelProbability: true,
      marketProbability: true,
      modelBrier: true,
      marketBrier: true,
      modelLogLoss: true,
      marketLogLoss: true,
      snapshotAt: true,
    },
    orderBy: { snapshotAt: "asc" },
  });

  return summarizeForward(
    rows.flatMap((row) => {
      const mapped = mapSnapshotToForward({
        ...row,
        modelBrier: row.modelBrier === null ? null : Number(row.modelBrier),
        marketBrier: row.marketBrier === null ? null : Number(row.marketBrier),
        modelLogLoss:
          row.modelLogLoss === null ? null : Number(row.modelLogLoss),
        marketLogLoss:
          row.marketLogLoss === null ? null : Number(row.marketLogLoss),
      });
      return mapped ? [mapped] : [];
    }),
  );
}
