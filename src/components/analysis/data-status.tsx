"use client";

import {
  Clock3,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AnalysisDataStatus } from "@/lib/data/analysis-status";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_MS = 86_400_000;

const RUN_STATUS_LABEL: Record<string, string> = {
  SUCCESS: "Correcta",
  PARTIAL: "Parcial",
  FAILED: "Fallida",
  SKIPPED: "Omitida",
};

const STEP_STATUS_LABEL: Record<string, string> = {
  success: "ok",
  failed: "falló",
  skipped: "omitido",
};

export function formatAgeDays(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 día";
  return `hace ${days} días`;
}

function runStatusLabel(status: string): string {
  return RUN_STATUS_LABEL[status] ?? status;
}

function stepSummary(status: AnalysisDataStatus): string | null {
  if (!status.lastRun || status.lastRun.steps.length === 0) return null;
  return status.lastRun.steps
    .map(
      (step) =>
        `${step.name} ${STEP_STATUS_LABEL[step.status] ?? step.status}`,
    )
    .join(" · ");
}

function hasRunProblem(status: AnalysisDataStatus): boolean {
  return Boolean(
    status.lastRun &&
      status.lastRun.status !== "SUCCESS" &&
      status.lastRun.status !== "SKIPPED",
  );
}

export function DataStatusNotice({
  status,
  timeZone,
}: {
  status: AnalysisDataStatus;
  timeZone?: string;
}) {
  const batch = status.fixtureBatch;
  const stale = status.marketStale;
  const runProblem = hasRunProblem(status);
  const now = new Date(status.now);
  const batchDate = batch
    ? new Date(batch.capturedAt)
    : status.lastFixtureImportAt
      ? new Date(status.lastFixtureImportAt)
      : null;
  const noRecentBatch =
    !batchDate || now.getTime() - batchDate.getTime() > 7 * DAY_MS;

  if (!stale && !noRecentBatch && !runProblem) return null;

  const importLabel = status.lastHistoricalImportAt
    ? formatDateTime(status.lastHistoricalImportAt, timeZone)
    : "sin registro";
  const batchLabel = batch
    ? `${formatDateTime(batch.capturedAt, timeZone)} (${formatAgeDays(batch.ageDays)})`
    : "sin lote";

  const shortTitle = stale
    ? `Mercado desactualizado (cuotas ${batch ? formatAgeDays(batch.ageDays) : ">4d"})`
    : noRecentBatch
      ? "Sin lote de cuotas reciente (>7d)"
      : `Actualización ${status.lastRun ? runStatusLabel(status.lastRun.status).toLowerCase() : "con incidencias"}`;

  const detailTitle = stale
    ? "Fuente de mercado desactualizada"
    : noRecentBatch
      ? "Sin lote de cuotas reciente"
      : "Actualización automática con incidencias";

  const failedStep = status.lastRun?.steps.find(
    (step) => step.status === "failed" && step.error,
  );

  return (
    <Sheet>
      <div
        role="status"
        className={cn(
          "flex h-9 items-center justify-between gap-2 rounded-md border px-2.5 text-[11px]",
          stale || runProblem
            ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
            : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        <div className="flex min-w-0 items-center gap-1 truncate">
          {stale || runProblem ? (
            <TriangleAlert className="size-3 shrink-0" aria-hidden />
          ) : (
            <Clock3 className="size-3 shrink-0" aria-hidden />
          )}
          <span className="truncate font-medium">{shortTitle}</span>
        </div>

        <div className="sr-only">
          <p>{detailTitle}</p>
          {stale && (
            <p>
              Las cuotas se capturaron{" "}
              {batch ? formatAgeDays(batch.ageDays) : "hace más de 4 días"}. La
              fuente Mercado se oculta hasta que llegue un lote nuevo.
            </p>
          )}
          {!stale && noRecentBatch && (
            <p>
              No ha llegado un lote de cuotas en más de 7 días. La fuente Mercado
              no se renueva hasta que llegue un CSV nuevo.
            </p>
          )}
          {runProblem && status.lastRun && (
            <p>
              Última corrida: {runStatusLabel(status.lastRun.status)}{" "}
              {status.lastRun.error ? `(${status.lastRun.error})` : ""}
              {stepSummary(status) ? ` · ${stepSummary(status)}` : ""}.
            </p>
          )}
          {failedStep?.error && (
            <p>
              {failedStep.name}: {failedStep.error}
            </p>
          )}
          <p>
            Último import {importLabel} · cuotas {batchLabel}.
          </p>
        </div>

        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-2 text-[11px] font-semibold underline-offset-2 hover:underline"
          >
            Ver
          </Button>
        </SheetTrigger>
      </div>

      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{detailTitle}</SheetTitle>
          <SheetDescription>
            {stale
              ? "Las cuotas se capturaron hace más de 4 días y la fuente se oculta hasta nuevo lote."
              : noRecentBatch
                ? "No ha llegado un lote de cuotas en más de 7 días."
                : "La última sincronización o cálculo tuvo avisos o errores."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2.5 px-4 pb-8 text-xs leading-relaxed text-muted-foreground">
          {stale && (
            <p>
              Las cuotas se capturaron{" "}
              {batch ? formatAgeDays(batch.ageDays) : "hace más de 4 días"}. La
              fuente Mercado se oculta hasta que llegue un lote nuevo.
            </p>
          )}
          {!stale && noRecentBatch && (
            <p>
              No ha llegado un lote de cuotas en más de 7 días. La fuente Mercado
              no se renueva hasta que llegue un CSV nuevo.
            </p>
          )}
          {runProblem && status.lastRun && (
            <p>
              Última corrida: {runStatusLabel(status.lastRun.status)}{" "}
              {status.lastRun.error ? `(${status.lastRun.error})` : ""}
              {stepSummary(status) ? ` · ${stepSummary(status)}` : ""}.
            </p>
          )}
          {failedStep?.error && (
            <p className="rounded bg-rose-500/10 px-1.5 py-1 text-rose-700 dark:text-rose-300">
              {failedStep.name}: {failedStep.error}
            </p>
          )}
          <p>
            Último import {importLabel} · cuotas {batchLabel}.
          </p>

          <DataStatusDetails status={status} timeZone={timeZone} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function DataStatusDetails({
  status,
  timeZone,
}: {
  status: AnalysisDataStatus;
  timeZone?: string;
}) {
  const batch = status.fixtureBatch;
  const steps = status.lastRun?.steps ?? [];

  return (
    <div className="mt-3 rounded-lg border bg-muted/20 px-2.5 py-2 text-[11px]">
      <p className="flex items-center gap-1.5 font-medium">
        <RefreshCw className="size-3.5" aria-hidden />
        Estado de los datos
      </p>

      <dl className="mt-1.5 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Último import histórico</dt>
          <dd className="text-right font-medium">
            {status.lastHistoricalImportAt
              ? formatDateTime(status.lastHistoricalImportAt, timeZone)
              : "Sin registro"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Resultados API hoy</dt>
          <dd className="text-right font-medium tabular-nums">
            {status.resultsToday}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Último reajuste de ratings</dt>
          <dd className="text-right font-medium">
            {status.lastRatingAt
              ? formatDateTime(status.lastRatingAt, timeZone)
              : "Sin ratings"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Modelo activo</dt>
          <dd className="text-right font-medium">
            {status.champion?.name ?? "Sin campeón registrado"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Retador en observación</dt>
          <dd className="text-right font-medium">
            {status.challenger?.name ?? "Sin retador"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Último lote de cuotas</dt>
          <dd className="text-right font-medium">
            {batch
              ? `${formatDate(batch.capturedAt)} · ${formatAgeDays(batch.ageDays)}`
              : "Sin lote"}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Última corrida automática</dt>
          <dd className="text-right font-medium">
            {status.lastRun
              ? `${runStatusLabel(status.lastRun.status)} · ${formatDateTime(
                  status.lastRun.startedAt,
                  timeZone,
                )}`
              : "Sin corridas"}
          </dd>
        </div>
        {status.lastRun?.durationMs !== null &&
          status.lastRun?.durationMs !== undefined && (
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Duración</dt>
              <dd className="text-right font-medium tabular-nums">
                {Math.max(0, Math.round(status.lastRun.durationMs / 1000))} s
              </dd>
            </div>
          )}
      </dl>

      {steps.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {steps.map((step) => (
            <li
              key={step.name}
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[10px]",
                step.status === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : step.status === "failed"
                    ? "border-rose-500/30 bg-rose-500/10"
                    : "border-border bg-background text-muted-foreground",
              )}
            >
              {step.name}: {STEP_STATUS_LABEL[step.status] ?? step.status}
            </li>
          ))}
        </ul>
      )}

      {steps
        .filter((step) => step.status === "failed" && step.error)
        .map((step) => (
          <p
            key={`error-${step.name}`}
            className="mt-1.5 rounded bg-rose-500/10 px-1.5 py-1 text-[10px] text-rose-700 dark:text-rose-300"
          >
            <span className="font-semibold">{step.name}:</span> {step.error}
          </p>
        ))}

      {status.marketStale && (
        <p className="mt-1.5 rounded bg-amber-500/10 px-1.5 py-1 text-amber-900 dark:text-amber-200">
          Mercado desactualizado: las cuotas se capturaron{" "}
          {batch ? formatAgeDays(batch.ageDays) : "hace más de 4 días"} y la
          fuente se oculta.
        </p>
      )}
      {(status.marketStale || status.marketMissing) && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Las APIs solo aportan calendario: el mercado se reactiva al importar un
          fixtures.csv nuevo (descarga manual).
        </p>
      )}
      {status.marketMissing && (
        <p className="mt-1.5 text-muted-foreground">
          Sin lote de fixtures: la fuente Mercado no se renueva hasta que llegue
          un CSV nuevo.
        </p>
      )}
      {status.lastRun?.error && (
        <p className="mt-1.5 text-rose-700 dark:text-rose-300">
          {status.lastRun.error}
        </p>
      )}
    </div>
  );
}
