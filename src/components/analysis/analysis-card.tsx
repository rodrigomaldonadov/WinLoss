import type { ReactNode } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";

import { ProbabilityHeadline } from "@/components/analysis/probability-panel";
import { Button } from "@/components/ui/button";
import {
  analysisBetHref,
  type AnalysisFeedItem,
} from "@/lib/analysis/view";
import { formatDateTime } from "@/lib/format";

function MatchHeading({ item }: { item: AnalysisFeedItem }) {
  return (
    <h2 className="truncate text-sm font-semibold leading-tight">
      {item.homeName} <span className="font-normal text-muted-foreground">vs</span>{" "}
      {item.awayName}
    </h2>
  );
}

function CardShell({
  item,
  children,
}: {
  item: AnalysisFeedItem;
  children: ReactNode;
}) {
  return (
    <article className="group relative flex min-w-0 flex-col rounded-lg border bg-card p-2 shadow-xs transition-colors hover:bg-muted/30 min-h-[220px]">
      <Link
        href={`/analysis/${item.id}`}
        aria-label={`Ver detalle de ${item.homeName} vs ${item.awayName}`}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col justify-between gap-1">
        {children}
      </div>
    </article>
  );
}

export function AnalysisCard({
  item,
  timeZone,
}: {
  item: AnalysisFeedItem;
  timeZone?: string;
}) {
  const available = item.final.available && Boolean(item.final.probabilities);

  return (
    <CardShell item={item}>
      <header className="flex items-center justify-between gap-1 leading-none">
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-xs font-medium text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{item.competition}</span>
            <span aria-hidden>·</span>
            <time dateTime={item.kickoff.toISOString()}>
              {formatDateTime(item.kickoff, timeZone)}
            </time>
          </p>
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </header>

      <MatchHeading item={item} />

      {available ? (
        <ProbabilityHeadline item={item} compact />
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Sin datos suficientes
        </p>
      )}

      <div className="pointer-events-auto relative z-20 mt-1 flex justify-end">
        <Button asChild size="sm" className="h-11 px-3 text-sm">
          <Link href={analysisBetHref(item)}>Registrar apuesta</Link>
        </Button>
      </div>
    </CardShell>
  );
}

/** Tarjeta compacta para partidos sin probabilidad final. */
export function NoAnalysisCard({
  item,
  timeZone,
}: {
  item: AnalysisFeedItem;
  timeZone?: string;
}) {
  return (
    <CardShell item={item}>
      <header className="flex items-center justify-between gap-1 leading-none">
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-xs font-medium text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{item.competition}</span>
            <span aria-hidden>·</span>
            <time dateTime={item.kickoff.toISOString()}>
              {formatDateTime(item.kickoff, timeZone)}
            </time>
          </p>
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </header>

      <MatchHeading item={item} />

      <p className="mt-1 text-xs text-muted-foreground">
        Sin análisis disponible para este partido.
      </p>

      <div className="pointer-events-auto relative z-20 mt-1 flex justify-end">
        <Button asChild size="sm" className="h-11 px-3 text-sm">
          <Link href={analysisBetHref(item)}>Registrar apuesta</Link>
        </Button>
      </div>
    </CardShell>
  );
}





