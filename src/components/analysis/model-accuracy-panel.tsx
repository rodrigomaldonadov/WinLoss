import { BarChart3, ChevronDown } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ForwardAccuracy } from "@/lib/analysis/forward";
import type { ModelAccuracy } from "@/lib/data/analysis";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function brier(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value.toFixed(3)
    : "—";
}

function sample(value: number | null | undefined): string {
  return typeof value === "number" && value > 0 ? String(value) : "—";
}

function Metric({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-background px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          strong && "text-primary",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Panel de precisión del modelo. Consume el mismo contrato que
 * GET /api/analysis/model: N, periodo y baselines del backtest.
 */
export function ModelAccuracyPanel({
  accuracy,
  forward,
}: {
  accuracy: ModelAccuracy;
  forward: ForwardAccuracy;
}) {
  const marketWins = accuracy.competitions.filter(
    (competition) => competition.marketBrier < competition.modelBrier,
  ).length;
  const total = accuracy.competitions.length;
  const modelWeight = Math.max(
    accuracy.global.weight,
    ...accuracy.competitions.map((competition) => competition.weight),
  );
  const forwardDiff =
    forward.modelBrier !== null && forward.marketBrier !== null
      ? forward.modelBrier - forward.marketBrier
      : null;
  const periodEnd = accuracy.holdout.end
    ? formatDate(accuracy.holdout.end, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "hoy";
  const periodStart = formatDate(accuracy.holdout.start, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-4" aria-hidden />
          Precisión del modelo
        </CardTitle>
        <CardDescription>
          Backtest {periodStart} – {periodEnd} · {accuracy.global.sample}{" "}
          partidos · {accuracy.model}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-3 gap-1.5">
          <Metric
            label="Modelo"
            value={brier(accuracy.global.modelBrier)}
            hint="Brier"
          />
          <Metric
            label="Mercado cierre"
            value={brier(accuracy.global.marketBrier)}
            hint="Brier"
            strong
          />
          <Metric
            label="Ingenua"
            value={brier(accuracy.global.naiveBrier)}
            hint="Brier"
          />
        </div>

        <p className="text-xs leading-snug text-muted-foreground">
          Baselines: <strong className="text-foreground">cierre</strong> usa la
          cuota media de cierre sin margen;{" "}
          <strong className="text-foreground">pre-cierre</strong> usa la cuota
          previa disponible; <strong className="text-foreground">ingenua</strong>{" "}
          usa frecuencias históricas de local/empate/visitante. Menos Brier es
          mejor.
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={marketWins === total ? "default" : "outline"}>
            El mercado ganó en {marketWins} de {total} ligas
          </Badge>
          <Badge variant="outline">Peso del modelo: {modelWeight}</Badge>
          <Badge variant="outline">Sin datos inventados</Badge>
        </div>

        <details className="group rounded-lg border bg-muted/20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium">
            Por liga y por qué cambia N
            <ChevronDown
              className="size-4 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>

          <div className="space-y-2 border-t px-2.5 py-2.5">
            <p className="text-[11px] leading-snug text-muted-foreground">
              N cambia según el baseline disponible. El total del holdout
              incluye todos los partidos con cuota de cierre; el subconjunto
              pre-cierre solo incluye partidos con cuota previa (Brasil y
              Argentina no la tienen en este corte). La referencia ingenua usa
              frecuencias históricas de la liga. Por eso cada columna puede
              tener una muestra distinta.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Liga</th>
                    <th className="py-1.5 pr-2 text-right font-medium">N</th>
                    <th className="py-1.5 pr-2 text-right font-medium">
                      Modelo
                    </th>
                    <th className="py-1.5 pr-2 text-right font-medium">
                      Cierre
                    </th>
                    <th className="py-1.5 pr-2 text-right font-medium">
                      Pre-cierre
                    </th>
                    <th className="py-1.5 text-right font-medium">Ingenua</th>
                  </tr>
                </thead>
                <tbody>
                  {accuracy.competitions.map((competition) => {
                    const values = [
                      competition.modelBrier,
                      competition.marketBrier,
                      competition.marketPreBrier,
                      competition.naiveBrier,
                    ].filter(
                      (value): value is number =>
                        typeof value === "number" && value > 0,
                    );
                    const best = Math.min(...values);

                    return (
                      <tr
                        key={competition.competition}
                        className="border-b last:border-0"
                      >
                        <th className="py-1.5 pr-2 font-medium">
                          <span className="block">
                            {competition.competition}
                          </span>
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            {competition.code ?? "—"}
                            {competition.calibrationApplied
                              ? ` · T ${competition.temperature}`
                              : ""}
                          </span>
                        </th>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {sample(competition.sample)}
                          {competition.preSample > 0 &&
                          competition.preSample !== competition.sample ? (
                            <span className="block text-[10px] text-muted-foreground">
                              pre {competition.preSample}
                            </span>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 pr-2 text-right tabular-nums",
                            competition.modelBrier === best && "font-semibold",
                          )}
                        >
                          {brier(competition.modelBrier)}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 pr-2 text-right tabular-nums",
                            competition.marketBrier === best && "font-semibold",
                          )}
                        >
                          {brier(competition.marketBrier)}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 pr-2 text-right tabular-nums",
                            competition.marketPreBrier === best &&
                              "font-semibold",
                          )}
                        >
                          {brier(competition.marketPreBrier)}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 text-right tabular-nums",
                            competition.naiveBrier === best && "font-semibold",
                          )}
                        >
                          {brier(competition.naiveBrier)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] leading-snug text-muted-foreground">
              {accuracy.caveat}. El peso del modelo es {modelWeight} porque la
              validación temporal no mejoró el Brier del mercado en ninguna
              liga.
            </p>
          </div>
        </details>

        <div className="border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Desde que está en uso</h3>
            <Badge variant="outline">Forward test</Badge>
          </div>

          {forward.sample === 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Aún no hay partidos evaluados desde que está en uso. Los snapshots
              se evalúan cuando el partido termina.
            </p>
          ) : (
            <>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Desde{" "}
                {forward.since
                  ? formatDate(forward.since, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}{" "}
                · {forward.sample} partidos evaluados
              </p>

              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <Metric
                  label="Modelo"
                  value={
                    forward.modelBrier === null
                      ? "—"
                      : forward.modelBrier.toFixed(3)
                  }
                  hint={`N=${forward.modelSample}`}
                />
                <Metric
                  label="Mercado"
                  value={
                    forward.marketBrier === null
                      ? "—"
                      : forward.marketBrier.toFixed(3)
                  }
                  hint={`N=${forward.marketSample}`}
                />
                <Metric
                  label="Diferencia"
                  value={
                    forwardDiff === null
                      ? "—"
                      : `${forwardDiff > 0 ? "+" : ""}${forwardDiff.toFixed(3)}`
                  }
                  hint="Modelo − mercado"
                />
              </div>

              {forward.sample < 30 && (
                <p className="mt-2 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
                  Muestra pequeña (N={forward.sample}); todavía no es
                  concluyente.
                </p>
              )}

              <details className="group mt-2 rounded-lg border bg-muted/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium">
                  Forward por liga
                  <ChevronDown
                    className="size-4 shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="overflow-x-auto border-t px-2.5 py-2">
                  <table className="w-full min-w-[22rem] border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-1.5 pr-2 font-medium">Liga</th>
                        <th className="py-1.5 pr-2 text-right font-medium">
                          N
                        </th>
                        <th className="py-1.5 pr-2 text-right font-medium">
                          Modelo
                        </th>
                        <th className="py-1.5 pr-2 text-right font-medium">
                          Mercado
                        </th>
                        <th className="py-1.5 text-right font-medium">
                          Δ
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {forward.competitions.map((competition) => {
                        const difference =
                          competition.modelBrier !== null &&
                          competition.marketBrier !== null
                            ? competition.modelBrier -
                              competition.marketBrier
                            : null;
                        return (
                          <tr
                            key={competition.competition}
                            className="border-b last:border-0"
                          >
                            <th className="py-1.5 pr-2 font-medium">
                              <span className="block">
                                {competition.competition}
                              </span>
                              <span className="block text-[10px] font-normal text-muted-foreground">
                                {competition.code ?? "—"}
                              </span>
                            </th>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                              {competition.sample}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                              {competition.modelBrier === null
                                ? "—"
                                : competition.modelBrier.toFixed(3)}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                              {competition.marketBrier === null
                                ? "—"
                                : competition.marketBrier.toFixed(3)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums">
                              {difference === null
                                ? "—"
                                : `${difference > 0 ? "+" : ""}${difference.toFixed(3)}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>

              <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                Forward test separado del backtest histórico. N pequeño no es
                concluyente; no se cambian parámetros automáticamente.
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
