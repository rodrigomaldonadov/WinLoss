import type { Prisma, PrismaClient } from "@prisma/client";

import { runGenerateJob } from "./generate-job";
import { runImportJob } from "./import-job";
import { createPrismaLock } from "./lock";
import { runAnalysisRefresh, type RefreshSummary } from "./run";
import { runResultsJob } from "./results-job";
import { runSyncJob } from "./sync-job";

export const ANALYSIS_REFRESH_LOCK_KEY = "analysis-refresh";

export type AnalysisRefreshResult = {
  summary: RefreshSummary;
  logged: boolean;
};

/**
 * Punto común para el endpoint HTTP y el comando de contenedor. Mantiene el
 * lock, el límite de tiempo y el registro en AnalysisRefreshRun.
 */
export async function executeAnalysisRefresh({
  prisma,
  trigger = "cron",
  now = new Date(),
  timeoutMs = Number(process.env.ANALYSIS_REFRESH_TIMEOUT_MS ?? "840000"),
  logger = () => {},
}: {
  prisma: PrismaClient;
  trigger?: string;
  now?: Date;
  timeoutMs?: number;
  logger?: (message: string) => void;
}): Promise<AnalysisRefreshResult> {
  const lock = createPrismaLock(
    prisma,
    ANALYSIS_REFRESH_LOCK_KEY,
    Math.max(1_000, timeoutMs) + 120_000,
  );

  let summary: RefreshSummary;
  try {
    summary = await runAnalysisRefresh({
      lock,
      now,
      timeoutMs,
      logger,
      steps: {
        import: async ({ now: stepNow, deadline }) => {
          const result = await runImportJob({
            prisma,
            now: stepNow,
            deadline,
            logger,
          });
          return {
            ok: result.ok,
            summary: result,
            error:
              result.errors.length > 0 ? result.errors.join("; ") : undefined,
          };
        },
        sync: async ({ now: stepNow, deadline }) => {
          const result = await runSyncJob({
            prisma,
            now: stepNow,
            deadline,
            logger,
          });
          return {
            ok: result.ok,
            summary: result,
            error:
              result.errors.length > 0 ? result.errors.join("; ") : undefined,
          };
        },
        results: async ({ now: stepNow, deadline }) => {
          const result = await runResultsJob({
            prisma,
            now: stepNow,
            deadline,
            logger,
          });
          return {
            ok: result.ok,
            summary: result,
            error:
              result.errors.length > 0 ? result.errors.join("; ") : undefined,
          };
        },
        generate: async ({ now: stepNow, deadline }) => {
          const result = await runGenerateJob({
            prisma,
            now: stepNow,
            deadline,
            logger,
          });
          return {
            ok: result.ok,
            summary: result,
            error:
              result.errors.length > 0 ? result.errors.join("; ") : undefined,
          };
        },
      },
    });
  } catch (error) {
    const finishedAt = new Date();
    summary = {
      status: "FAILED",
      reason: error instanceof Error ? error.message : String(error),
      startedAt: now.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - now.getTime(),
      steps: [],
    };
  }

  let logged = false;
  try {
    await prisma.analysisRefreshRun.create({
      data: {
        trigger,
        status: summary.status,
        startedAt: new Date(summary.startedAt),
        finishedAt: new Date(summary.finishedAt),
        durationMs: summary.durationMs,
        steps: summary.steps as unknown as Prisma.InputJsonValue,
        error: summary.reason ?? null,
      },
    });
    logged = true;
  } catch (error) {
    logger(
      `[refresh] no se pudo guardar el resumen de la corrida: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return { summary, logged };
}
