import "server-only";

import type { Prisma } from "@prisma/client";

import {
  FIXTURE_MAX_AGE_MS,
  FIXTURE_SOURCE,
} from "@/lib/analysis/import";
import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;

export type AnalysisRunStepStatus = {
  name: string;
  status: string;
  durationMs: number;
  error?: string;
};

export type AnalysisDataStatus = {
  now: string;
  lastHistoricalImportAt: string | null;
  lastFixtureImportAt: string | null;
  fixtureBatch: {
    sourceFile: string;
    capturedAt: string;
    rowCount: number;
    ageDays: number;
    stale: boolean;
  } | null;
  lastRun: {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    error: string | null;
    steps: AnalysisRunStepStatus[];
  } | null;
  marketMissing: boolean;
  marketStale: boolean;
};

function parseSteps(value: Prisma.JsonValue | null): AnalysisRunStepStatus[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string") return [];
    return [
      {
        name: record.name,
        status: typeof record.status === "string" ? record.status : "unknown",
        durationMs:
          typeof record.durationMs === "number" ? record.durationMs : 0,
        error: typeof record.error === "string" ? record.error : undefined,
      },
    ];
  });
}

/** Estado operativo visible en /analysis y en el detalle. */
export async function getAnalysisDataStatus(
  now = new Date(),
): Promise<AnalysisDataStatus> {
  const [lastHistoricalFile, lastHistoricalRow, lastFixtureFile, batch, lastRun] =
    await Promise.all([
      prisma.analysisImportFile.findFirst({
        where: { kind: "historical" },
        orderBy: { processedAt: "desc" },
        select: { processedAt: true },
      }),
      prisma.historicalMatch.findFirst({
        orderBy: { importedAt: "desc" },
        select: { importedAt: true },
      }),
      prisma.analysisImportFile.findFirst({
        where: { kind: "fixtures" },
        orderBy: { processedAt: "desc" },
        select: { processedAt: true },
      }),
      prisma.fixtureBatch.findFirst({
        where: { source: FIXTURE_SOURCE },
        orderBy: { capturedAt: "desc" },
        select: {
          sourceFile: true,
          capturedAt: true,
          importedAt: true,
          rowCount: true,
        },
      }),
      prisma.analysisRefreshRun.findFirst({
        orderBy: { startedAt: "desc" },
        select: {
          status: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          error: true,
          steps: true,
        },
      }),
    ]);

  const lastHistoricalImportAt =
    lastHistoricalFile?.processedAt ?? lastHistoricalRow?.importedAt ?? null;
  const lastFixtureImportAt =
    lastFixtureFile?.processedAt ?? batch?.importedAt ?? null;

  const ageMs = batch ? now.getTime() - batch.capturedAt.getTime() : null;
  const fixtureBatch = batch
    ? {
        sourceFile: batch.sourceFile,
        capturedAt: batch.capturedAt.toISOString(),
        rowCount: batch.rowCount,
        ageDays: Math.max(0, Math.floor((ageMs ?? 0) / DAY_MS)),
        stale: (ageMs ?? 0) > FIXTURE_MAX_AGE_MS,
      }
    : null;

  return {
    now: now.toISOString(),
    lastHistoricalImportAt: lastHistoricalImportAt?.toISOString() ?? null,
    lastFixtureImportAt: lastFixtureImportAt?.toISOString() ?? null,
    fixtureBatch,
    lastRun: lastRun
      ? {
          status: lastRun.status,
          startedAt: lastRun.startedAt.toISOString(),
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
          durationMs: lastRun.durationMs,
          error: lastRun.error,
          steps: parseSteps(lastRun.steps),
        }
      : null,
    marketMissing: !fixtureBatch,
    marketStale: fixtureBatch?.stale ?? false,
  };
}
