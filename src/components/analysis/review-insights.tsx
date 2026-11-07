import Link from "next/link";
import { BarChart3, TrendingUp } from "lucide-react";

import { probabilityLabel } from "@/lib/analysis/view";
import type { ReviewResult } from "@/lib/analysis/review/types";
import { formatDate, formatDateTime, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

function topScoreLabel(probability: number): string {
  return probabilityLabel(probability);
}

export function ReviewInsights({
  review,
  timeZone,
}: {
  review: ReviewResult;
  timeZone?: string;
}) {
  const scores = review.scores.filter(
    (score): score is typeof score & { brier: number; logLoss: number } =>
      score.brier !== null && score.logLoss !== null,
  );
  const closest = scores.find((score) => score.source === review.closestSource);
  const smallSample = review.calibration
    ? review.calibration.sample < 30
    : false;

  return (
    <div className="space-y-3">
      {review.topScores !== null && review.topScores.length > 0 ? (
        <section aria-labelledby="marcadores" className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="marcadores" className="text-sm font-semibold">
              Marcadores más probables
            </h2>
            <span className="text-[10px] text-muted-foreground">
              Top {review.topScores.length}
            </span>
          </div>
          <ul className="grid grid-cols-5 gap-1">
            {review.topScores.map((score) => {
              const actual =
                score.home === review.homeGoals &&
                score.away === review.awayGoals;
              return (
                <li
                  key={`${score.home}-${score.away}`}
                  className={cn(
                    "rounded-md border px-1 py-1.5 text-center",
                    actual && "border-primary bg-primary/10",
                  )}
                >
                  <p className="text-[11px] font-semibold tabular-nums">
                    {score.home}–{score.away}
                  </p>
                  <p className="text-[9px] text-muted-foreground tabular-nums">
                    {topScoreLabel(score.probability)}
                  </p>
                  {actual && (
                    <span className="sr-only">Marcador real</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            {review.actualScoreInTop5
              ? `El marcador real (${review.homeGoals}–${review.awayGoals}) estaba entre los cinco más probables.`
              : `El marcador real (${review.homeGoals}–${review.awayGoals}) no estaba entre los cinco más probables.`}
          </p>
        </section>
      ) : (
        <section aria-labelledby="marcadores" className="space-y-1">
          <h2 id="marcadores" className="text-sm font-semibold">
            Marcadores más probables
          </h2>
          <p className="text-[11px] text-muted-foreground">
            No guardado: esta captura es anterior al top-5 de marcadores.
          </p>
        </section>
      )}

      <section aria-labelledby="puntuacion" className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="puntuacion" className="text-sm font-semibold">
            Puntuación del partido
          </h2>
          <span className="text-[10px] text-muted-foreground">
            Brier · log-loss
          </span>
        </div>
        {scores.length > 0 ? (
          <ul className="grid grid-cols-2 gap-1.5">
            {scores.map((score) => (
              <li
                key={score.source}
                className={cn(
                  "rounded-lg border px-2 py-1.5",
                  score.source === review.closestSource &&
                    "border-primary/40 bg-primary/5",
                )}
              >
                <p className="text-[10px] text-muted-foreground">
                  {score.label}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {score.brier.toFixed(3)}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  Log-loss {score.logLoss.toFixed(3)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Sin probabilidades 1X2 suficientes para puntuar el partido.
          </p>
        )}
        {closest && (
          <p className="text-[11px]">
            La fuente más cerca del resultado fue{" "}
            <strong className="font-semibold">{closest.label}</strong> (menor
            Brier).
          </p>
        )}
        <p className="text-[10px] leading-snug text-muted-foreground">
          Un solo partido no permite concluir nada sobre la calidad del modelo.
          N = 1.
        </p>
      </section>

      <section aria-labelledby="contexto" className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="contexto"
            className="flex items-center gap-1 text-sm font-semibold"
          >
            <TrendingUp className="size-4" aria-hidden />
            Contexto de la liga
          </h2>
          <Link
            href="/analysis/precision"
            className="text-[11px] font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver precisión
          </Link>
        </div>
        {review.calibration ? (
          <>
            <p className="text-[11px] leading-snug">
              Cuando el modelo dio alrededor de{" "}
              <strong className="tabular-nums">
                {formatPercent(review.calibration.probability, {
                  decimals: 0,
                })}
              </strong>{" "}
              a un resultado en esta liga, ese resultado ocurrió el{" "}
              <strong className="tabular-nums">
                {formatPercent(review.calibration.observed, { decimals: 0 })}
              </strong>{" "}
              de las veces (N = {review.calibration.sample}; banda{" "}
              {review.calibration.bin} %).
            </p>
            {smallSample && (
              <p className="rounded bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-900 dark:text-amber-200">
                Muestra pequeña (N = {review.calibration.sample}); no es
                concluyente.
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Sin referencia de calibración para esta liga y banda de
            probabilidad.
          </p>
        )}
        <p className="text-[10px] leading-snug text-muted-foreground">
          La calibración sale del backtest de la liga; no se recalcula con este
          partido.
        </p>
      </section>

      {review.community && (
        <section aria-labelledby="comunidad" className="space-y-1">
          <h2 id="comunidad" className="text-sm font-semibold">
            Comunidad en la captura
          </h2>
          <p className="text-[11px]">
            {review.community.sample}{" "}
            {review.community.sample === 1 ? "usuario" : "usuarios"} con picks
            compartidos.
          </p>
          {review.community.probabilities && (
            <p className="text-[11px] text-muted-foreground">
              Local{" "}
              {probabilityLabel(review.community.probabilities.home)} · Empate{" "}
              {probabilityLabel(review.community.probabilities.draw)} ·
              Visitante{" "}
              {probabilityLabel(review.community.probabilities.away)}
            </p>
          )}
          <p className="text-[10px] leading-snug text-muted-foreground">
            Agregado anónimo de quienes comparten estadísticas. Solo se muestra
            si el snapshot lo guardó con 5 usuarios o más; no se reconstruye.
          </p>
        </section>
      )}

      <section aria-labelledby="captura" className="space-y-1">
        <h2
          id="captura"
          className="flex items-center gap-1 text-sm font-semibold"
        >
          <BarChart3 className="size-4" aria-hidden />
          Origen del cálculo
        </h2>
        <p className="text-[10px] leading-snug text-muted-foreground">
          {review.mode === "saved"
            ? `Captura guardada el ${formatDateTime(review.calculatedAt, timeZone)}.`
            : `Reconstrucción calculada el ${formatDateTime(review.calculatedAt, timeZone)}.`}{" "}
          {review.ratingsAsOf
            ? `Ratings as-of ${formatDate(review.ratingsAsOf, {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}.`
            : ""}
        </p>
      </section>
    </div>
  );
}
