import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  MODEL_MARKET_CAVEAT,
  NO_MARKET_BASELINE_NOTE,
} from "@/lib/analysis/constants";
import type { Triple } from "@/lib/analysis/engine";
import {
  OUTCOMES,
  analysisBetHref,
  bttsPick,
  confidenceLabel,
  matchResultPick,
  probabilityLabel,
  totalGoalsPick,
  type AnalysisFeedItem,
  type OutcomeKey,
} from "@/lib/analysis/view";
import { cn } from "@/lib/utils";

import { BookmakerOddsComparator } from "./odds-comparator";

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
  hrefForOutcome,
}: {
  probabilities: Triple;
  className?: string;
  hrefForOutcome?: (outcome: OutcomeKey) => string;
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
        const href = hrefForOutcome?.(outcome.key);
        const cellClass = cn(
          "block rounded-lg border px-2 py-2 text-center",
          value === best
            ? "border-primary/40 bg-primary/5"
            : "border-border bg-muted/30",
          href && "transition-colors hover:bg-muted/60",
        );
        const content = (
          <>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {outcome.short} · {outcome.label}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">
              {probabilityLabel(value)}
            </p>
          </>
        );
        return href ? (
          <Link
            key={outcome.key}
            href={href}
            aria-label={`Precargar ${outcome.label} en una nueva apuesta`}
            className={cellClass}
          >
            {content}
          </Link>
        ) : (
          <div key={outcome.key} className={cellClass}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function TotalCell({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{probabilityLabel(value)}</span>
    </>
  );
  const className =
    "flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5";
  return href ? (
    <Link
      href={href}
      aria-label={`Precargar ${label} en una nueva apuesta`}
      className={cn(className, "transition-colors hover:bg-muted/60")}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function TotalsLine({
  totals,
  hrefOver,
  hrefUnder,
}: {
  totals: AnalysisFeedItem["final"]["totals"];
  hrefOver?: string;
  hrefUnder?: string;
}) {
  if (!totals) return null;
  return (
    <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px]">
      <TotalCell
        label="Más de 2,5"
        value={totals.over25}
        href={hrefOver}
      />
      <TotalCell
        label="Menos de 2,5"
        value={totals.under25}
        href={hrefUnder}
      />
    </div>
  );
}

export function BttsLine({
  value,
  label = "Ambos marcan",
  hrefYes,
  hrefNo,
}: {
  value: number | null | undefined;
  label?: string;
  hrefYes?: string;
  hrefNo?: string;
}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  return (
    <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        {hrefYes ? (
          <Link
            href={hrefYes}
            aria-label="Precargar ambos marcan Sí en una nueva apuesta"
            className="font-medium tabular-nums underline-offset-4 hover:underline"
          >
            Sí {probabilityLabel(value)}
          </Link>
        ) : (
          <span className="font-medium tabular-nums">
            Sí {probabilityLabel(value)}
          </span>
        )}
        {hrefNo ? (
          <Link
            href={hrefNo}
            aria-label="Precargar ambos marcan No en una nueva apuesta"
            className="font-medium tabular-nums underline-offset-4 hover:underline"
          >
            No {probabilityLabel(1 - value)}
          </Link>
        ) : (
          <span className="font-medium tabular-nums">
            No {probabilityLabel(1 - value)}
          </span>
        )}
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
  const modelBtts = item.sources.model.btts;
  const marketNote = item.sources.market.note ?? "Promedio de cierre sin margen";
  const marketNoteWithPeriod = /[.!?]$/.test(marketNote)
    ? marketNote
    : `${marketNote}.`;

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

      <ProbabilityGrid
        probabilities={probabilities}
        className="mt-2"
        hrefForOutcome={(outcome) =>
          analysisBetHref(item, matchResultPick(outcome))
        }
      />
      <TotalsLine
        totals={final.totals}
        hrefOver={analysisBetHref(item, totalGoalsPick("OVER", 2.5))}
        hrefUnder={analysisBetHref(item, totalGoalsPick("UNDER", 2.5))}
      />
      <BttsLine
        value={modelBtts}
        label={isMarket ? "Modelo · ambos marcan" : "Ambos marcan"}
        hrefYes={analysisBetHref(item, bttsPick("YES"))}
        hrefNo={analysisBetHref(item, bttsPick("NO"))}
      />

      {isMarket ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          {marketNoteWithPeriod}{" "}
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
 * Incluye la cuota que escriba el usuario y la diferencia del modelo.
 */
export function FairOddsComparator({ item }: { item: AnalysisFeedItem }) {
  const market = item.sources.market.probabilities;
  if (!item.sources.market.available || !market) return null;

  return (
    <BookmakerOddsComparator
      market={market}
      model={item.sources.model.probabilities}
    />
  );
}
