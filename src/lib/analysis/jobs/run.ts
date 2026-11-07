import type { JobLock } from "./lock";

export type RefreshStepName = "import" | "sync" | "generate";
export type RefreshStepStatus = "success" | "failed" | "skipped";
export type RefreshRunStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";

export type RefreshStepContext = {
  now: Date;
  /** Timestamp (ms) en el que el job completo debe detenerse. */
  deadline: number;
};

export type RefreshStepResult = {
  ok: boolean;
  summary?: unknown;
  error?: string;
};

export type RefreshStepFn = (
  context: RefreshStepContext,
) => Promise<RefreshStepResult>;

export type RefreshSteps = Record<RefreshStepName, RefreshStepFn>;

export type RefreshStepRecord = {
  name: RefreshStepName;
  status: RefreshStepStatus;
  durationMs: number;
  summary?: unknown;
  error?: string;
};

export type RefreshSummary = {
  status: RefreshRunStatus;
  reason?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  steps: RefreshStepRecord[];
};

export const REFRESH_STEP_ORDER: readonly RefreshStepName[] = [
  "import",
  "sync",
  "generate",
];

type Logger = (message: string) => void;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ejecuta import → sync → generate. Cada paso se aísla: si uno falla, los
 * siguientes continúan. El lock evita solapamientos entre invocaciones.
 */
export async function runAnalysisRefresh({
  steps,
  lock,
  now = new Date(),
  timeoutMs = Number(process.env.ANALYSIS_REFRESH_TIMEOUT_MS ?? "840000"),
  logger = () => {},
}: {
  steps: RefreshSteps;
  lock: JobLock;
  now?: Date;
  timeoutMs?: number;
  logger?: Logger;
}): Promise<RefreshSummary> {
  const startedAt = new Date(now);
  const deadline = startedAt.getTime() + Math.max(1, timeoutMs);
  const stepRecords: RefreshStepRecord[] = [];

  let acquired = false;
  try {
    acquired = await lock.acquire();
  } catch (error) {
    const finishedAt = new Date();
    return {
      status: "FAILED",
      reason: `No se pudo adquirir el lock: ${errorMessage(error)}`,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      steps: [],
    };
  }

  if (!acquired) {
    const finishedAt = new Date();
    logger("[refresh] omitido: ya hay una ejecución en curso");
    return {
      status: "SKIPPED",
      reason: "locked",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      steps: REFRESH_STEP_ORDER.map((name) => ({
        name,
        status: "skipped" as const,
        durationMs: 0,
        error: "locked",
      })),
    };
  }

  try {
    for (const name of REFRESH_STEP_ORDER) {
      const stepStart = Date.now();
      if (stepStart >= deadline) {
        stepRecords.push({
          name,
          status: "skipped",
          durationMs: 0,
          error: "timeout",
        });
        logger(`[refresh] ${name}: omitido por límite de tiempo`);
        continue;
      }

      try {
        const result = await steps[name]({ now: startedAt, deadline });
        stepRecords.push({
          name,
          status: result.ok ? "success" : "failed",
          durationMs: Date.now() - stepStart,
          summary: result.summary,
          error: result.error,
        });
        logger(
          `[refresh] ${name}: ${result.ok ? "ok" : "falló"}${
            result.error ? ` (${result.error})` : ""
          } en ${Date.now() - stepStart} ms`,
        );
      } catch (error) {
        const message = errorMessage(error);
        stepRecords.push({
          name,
          status: "failed",
          durationMs: Date.now() - stepStart,
          error: message,
        });
        logger(`[refresh] ${name}: falló (${message})`);
      }
    }
  } finally {
    try {
      await lock.release();
    } catch (error) {
      logger(`[refresh] no se pudo liberar el lock: ${errorMessage(error)}`);
    }
  }

  const finishedAt = new Date();
  const successful = stepRecords.filter((step) => step.status === "success");
  const status: RefreshRunStatus =
    successful.length === stepRecords.length && stepRecords.length > 0
      ? "SUCCESS"
      : successful.length > 0
        ? "PARTIAL"
        : "FAILED";

  return {
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    steps: stepRecords,
  };
}
