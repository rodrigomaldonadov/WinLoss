import { NextResponse } from "next/server";

import { ANALYSIS_REFRESH_LOCK_KEY } from "@/lib/analysis/jobs/refresh-runner";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  const header = request.headers.get("authorization") ?? "";
  const token =
    header.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret");
  return token === secret;
}

function serializeRun(run: {
  id: string;
  trigger: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  steps: unknown;
  error: string | null;
}) {
  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    steps: run.steps,
    error: run.error,
  };
}

/**
 * Estado de la última corrida y del lock del refresh. Útil para monitorización
 * cuando el job se lanza dentro del contenedor y no hay respuesta HTTP.
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

  const now = new Date();
  try {
    const [lock, runs] = await Promise.all([
      prisma.analysisRefreshLock.findUnique({
        where: { key: ANALYSIS_REFRESH_LOCK_KEY },
      }),
      prisma.analysisRefreshRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 5,
      }),
    ]);

    const running = Boolean(
      lock && lock.expiresAt.getTime() > now.getTime(),
    );

    return NextResponse.json({
      ok: true,
      now: now.toISOString(),
      running,
      lock: lock
        ? {
            lockedAt: lock.lockedAt.toISOString(),
            expiresAt: lock.expiresAt.toISOString(),
            expiresInMs: Math.max(
              0,
              lock.expiresAt.getTime() - now.getTime(),
            ),
          }
        : null,
      lastRun: runs[0] ? serializeRun(runs[0]) : null,
      recentRuns: runs.map(serializeRun),
    });
  } catch (error) {
    console.error("[cron/analysis-refresh/status]", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
