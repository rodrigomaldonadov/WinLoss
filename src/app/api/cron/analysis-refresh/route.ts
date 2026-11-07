import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { runGenerateJob } from "@/lib/analysis/jobs/generate-job";
import { runImportJob } from "@/lib/analysis/jobs/import-job";
import { createPrismaLock } from "@/lib/analysis/jobs/lock";
import { runAnalysisRefresh } from "@/lib/analysis/jobs/run";
import { runSyncJob } from "@/lib/analysis/jobs/sync-job";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

const LOCK_KEY = "analysis-refresh";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  const header = request.headers.get("authorization") ?? "";
  const token =
    header.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret");
  return token === secret;
}

async function recordRun(summary: Awaited<ReturnType<typeof runAnalysisRefresh>>) {
  try {
    await prisma.analysisRefreshRun.create({
      data: {
        trigger: "cron",
        status: summary.status,
        startedAt: new Date(summary.startedAt),
        finishedAt: new Date(summary.finishedAt),
        durationMs: summary.durationMs,
        steps: summary.steps as unknown as Prisma.InputJsonValue,
        error: summary.reason ?? null,
      },
    });
    return true;
  } catch (error) {
    console.error("[cron/analysis-refresh] no se pudo guardar el resumen", error);
    return false;
  }
}

/**
 * Job único de /analysis: import incremental → sync de APIs → recálculo.
 * Protegido con CRON_SECRET. Si ya hay una corrida en curso devuelve SKIPPED.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET no configurado" },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );
  }

  const timeoutMs = Number(
    process.env.ANALYSIS_REFRESH_TIMEOUT_MS ?? "840000",
  );
  const lock = createPrismaLock(prisma, LOCK_KEY, timeoutMs + 120_000);

  let summary: Awaited<ReturnType<typeof runAnalysisRefresh>>;
  try {
    summary = await runAnalysisRefresh({
      lock,
      timeoutMs,
      logger: (message) => console.log(message),
      steps: {
        import: async ({ now, deadline }) => {
          const result = await runImportJob({
            prisma,
            now,
            deadline,
            logger: (message) => console.log(message),
          });
          return {
            ok: result.ok,
            summary: result,
            error: result.errors.length > 0 ? result.errors.join("; ") : undefined,
          };
        },
        sync: async ({ now, deadline }) => {
          const result = await runSyncJob({
            prisma,
            now,
            deadline,
            logger: (message) => console.log(message),
          });
          return {
            ok: result.ok,
            summary: result,
            error: result.errors.length > 0 ? result.errors.join("; ") : undefined,
          };
        },
        generate: async ({ now, deadline }) => {
          const result = await runGenerateJob({
            prisma,
            now,
            deadline,
            logger: (message) => console.log(message),
          });
          return {
            ok: result.ok,
            summary: result,
            error: result.errors.length > 0 ? result.errors.join("; ") : undefined,
          };
        },
      },
    });
  } catch (error) {
    console.error("[cron/analysis-refresh]", error);
    const now = new Date();
    summary = {
      status: "FAILED",
      reason: error instanceof Error ? error.message : String(error),
      startedAt: now.toISOString(),
      finishedAt: now.toISOString(),
      durationMs: 0,
      steps: [],
    };
  }

  const logged = await recordRun(summary);
  return NextResponse.json({
    ok: summary.status === "SUCCESS" || summary.status === "PARTIAL",
    logged,
    ...summary,
  });
}
