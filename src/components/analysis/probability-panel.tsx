import { Scale } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  MODEL_MARKET_CAVEAT,
  NO_MARKET_BASELINE_NOTE,
} from "@/lib/analysis/constants";
import type { Triple } from "@/lib/analysis/engine";
import {
  OUTCOMES,
  confidenceLabel,
  fairOdds,
  fairOddsDifference,
  probabilityLabel,
  type AnalysisFeedItem,
} from "@/lib/analysis/view";
import { formatOdds, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

function headlineTitle(source: AnalysisFeedItem["final"]["source"]): string {
  if (source === "market") return "Probabilidad del mercado (sin margen)";
  if (source === "blend") return "Probabilidad combinada (modelo y mercado)";
  return "Estimación del modelo (sin cuotas)";
}

function confidenceBadge(
  confidence: AnalysisFeedItem["final"]["confidence"],
): string {
  if (confidence === "INSUFFICIENT") return "Sin datos suficientes";
  return `Confianza ${confidenceLabel(confidence).toLowerCase()}`;
}

export function ProbabilityGrid({
  probabilities,
  className,
}: {
  probabilities: Triple;
  className?: string;
}) {
  const best = Math.max(
    probabilities.home,
    probabilities.draw,
    probabilities.away,
  );

  return (
    <div className={cn("grid grid-cols-3 gap-1.5", className)}>
      {OUTCOMES.map((outcome) => {
        const value = probabilities[outcome.key];
        return (
          <div
            key={outcome.key}
            className={cn(
              "rounded-lg border px-2 py-2 text-center",
              value === best
                ? "border-primary/40 bg-primary/5"
                : "border-border bg-muted/30",
            )}
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {outcome.short} · {outcome.label}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {probabilityLabel(value)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function TotalsLine({
  totals,
}: {
  totals: AnalysisFeedItem["final"]["totals"];
}) {
  if (!totals) return null;
  return (
    <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5 text-[11px]">
      <span className="text-muted-foreground">Más de 2,5 goles</span>
      <span className="font-medium tabular-nums">
        {probabilityLabel(totals.over25)}
      </span>
      <span className="text-muted-foreground">Menos de 2,5</span>
      <span className="font-medium tabular-nums">
        {probabilityLabel(totals.under25)}
      </span>
    </div>
  );
}

/** Titular de la tarjeta: mercado si hay cuotas; modelo si no las hay. */
export function ProbabilityHeadline({ item }: { item: AnalysisFeedItem }) {
  const final = item.final;
  const probabilities = final.probabilities;
  if (!final.available || !probabilities) return null;

  const isMarket = final.source === "market";
  const displayConfidence =
    isMarket || final.source === "blend" ? final.confidence : "LOW";
  const caveat = item.reference.hasMarketBacktest
    ? MODEL_MARKET_CAVEAT
    : NO_MARKET_BASELINE_NOTE;

  return (
    <div className="mt-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium leading-snug text-muted-foreground">
          {headlineTitle(final.source)}
        </p>
        <Badge variant={isMarket ? "secondary" : "outline"}>
          {confidenceBadge(displayConfidence)}
        </Badge>
      </div>

      <ProbabilityGrid probabilities={probabilities} className="mt-2" />
      <TotalsLine totals={final.totals} />

      {isMarket ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          {item.sources.market.note ?? "Promedio de cierre sin margen."}{" "}
          {item.sources.model.available
            ? "El modelo se muestra aparte solo para comparar."
            : (item.sources.model.note ?? "Modelo no disponible")}
        </p>
      ) : (
        <div className="mt-2 rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          <p className="font-medium text-foreground">{caveat}.</p>
          <p className="mt-0.5">
            Sin cuotas de mercado para este partido. La estimación es solo del
            modelo y no se presenta como una probabilidad validada.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Comparador de cuotas justas. Solo se muestra si hay probabilidad de mercado.
 * No calcula valor esperado ni recomienda apostar.
 */
export function FairOddsComparator({ item }: { item: AnalysisFeedItem }) {
  const market = item.sources.market.probabilities;
  if (!item.sources.market.available || !market) return null;

  const model = item.sources.model.probabilities;

  return (
    <section
      aria-label="Comparador de cuotas justas"
      className="mt-3 rounded-lg border bg-muted/20 p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium">
          <Scale className="size-3.5" aria-hidden />
          Comparador de cuotas justas
        </p>
        <Badge variant="outline">Solo comparación</Badge>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
        Cuota justa = 1 / probabilidad. No implica valor ni una recomendación.
      </p>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {OUTCOMES.map((outcome) => {
          const marketFair = fairOdds(market[outcome.key]);
          const delta = model
            ? fairOddsDifference(model[outcome.key], market[outcome.key])
            : null;

          return (
            <div
              key={outcome.key}
              className="rounded-md border bg-background px-2 py-1.5 text-center"
            >
              <p className="text-[10px] font-medium uppercase text-muted-foreground">
                {outcome.short}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {marketFair === null ? "—" : formatOdds(marketFair)}
              </p>
              {delta === null ? (
                <p className="text-[10px] text-muted-foreground">Sin modelo</p>
              ) : (
                <p className="text-[10px] font-medium tabular-nums text-foreground">
                  {formatPercent(delta, { decimals: 0, signed: true })}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        Diferencia = cuota justa del modelo frente al mercado. Positivo: el
        modelo da más cuota (menos probabilidad que el mercado).
      </p>
    </section>
  );
}
