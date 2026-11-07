import { CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  FairOddsComparator,
  ProbabilityHeadline,
} from "@/components/analysis/probability-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  analysisBetHref,
  type AnalysisFeedItem,
} from "@/lib/analysis/view";
import { formatDateTime } from "@/lib/format";

function sourceBadge(item: AnalysisFeedItem) {
  if (item.final.source === "market") {
    return { label: "Mercado", variant: "secondary" as const };
  }
  if (item.final.source === "blend") {
    return { label: "Modelo + mercado", variant: "secondary" as const };
  }
  if (item.final.source === "model") {
    return { label: "Modelo", variant: "outline" as const };
  }
  return { label: "Sin datos", variant: "outline" as const };
}

function MatchHeading({ item }: { item: AnalysisFeedItem }) {
  return (
    <h2 className="mt-1 text-base font-semibold leading-snug">
      <Link
        href={`/analysis/${item.id}`}
        className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {item.homeName} <span className="text-muted-foreground">vs</span>{" "}
        {item.awayName}
      </Link>
    </h2>
  );
}

export function AnalysisCard({
  item,
  timeZone,
}: {
  item: AnalysisFeedItem;
  timeZone?: string;
}) {
  const badge = sourceBadge(item);
  const available = item.final.available && Boolean(item.final.probabilities);

  return (
    <article className="flex flex-col rounded-xl border bg-card p-3 shadow-xs">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {item.competition}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            <time dateTime={item.kickoff.toISOString()}>
              {formatDateTime(item.kickoff, timeZone)}
            </time>
          </p>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </header>

      <MatchHeading item={item} />

      {available ? (
        <ProbabilityHeadline item={item} />
      ) : (
        <p className="mt-2 rounded-lg border border-dashed bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
          Sin datos suficientes para estimar probabilidades.
        </p>
      )}

      <FairOddsComparator item={item} />

      <footer className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/analysis/${item.id}`}>
            Ver detalle
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button asChild size="sm" variant={available ? "outline" : "default"}>
          <Link href={analysisBetHref(item)}>Registrar apuesta</Link>
        </Button>
      </footer>
    </article>
  );
}

/**
 * Tarjeta para partidos sin probabilidad final. No muestra cifras para no
 * sugerir un análisis que no existe.
 */
export function NoAnalysisCard({
  item,
  timeZone,
}: {
  item: AnalysisFeedItem;
  timeZone?: string;
}) {
  return (
    <article className="rounded-xl border border-dashed bg-card p-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            {item.competition}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            <time dateTime={item.kickoff.toISOString()}>
              {formatDateTime(item.kickoff, timeZone)}
            </time>
          </p>
        </div>
        <Badge variant="outline">Sin probabilidades</Badge>
      </header>

      <MatchHeading item={item} />

      <p className="mt-1.5 text-xs font-medium">Sin datos suficientes</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {item.sources.model.note ?? "No hay cuotas ni muestra para este partido."}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/analysis/${item.id}`}>Ver fuentes</Link>
        </Button>
        <Button asChild size="sm">
          <Link href={analysisBetHref(item)}>Registrar apuesta</Link>
        </Button>
      </div>
    </article>
  );
}
