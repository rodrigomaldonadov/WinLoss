import Link from "next/link";

import {
  ANALYSIS_DAY_OPTIONS,
  analysisHref,
  type AnalysisDays,
} from "@/lib/analysis/view";
import { cn } from "@/lib/utils";

export type CompetitionFilterOption = {
  key: string;
  label: string;
  count: number;
};

export function AnalysisFilters({
  days,
  selected,
  competitions,
}: {
  days: AnalysisDays;
  selected: string[];
  competitions: CompetitionFilterOption[];
}) {
  return (
    <div className="space-y-2.5">
      <nav
        aria-label="Periodo de análisis"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ANALYSIS_DAY_OPTIONS.map((option) => {
          const active = option === days;
          return (
            <Link
              key={option}
              href={analysisHref({ days: option, competitions: selected })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 shrink-0 items-center justify-center rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background text-muted-foreground active:bg-muted",
              )}
            >
              {option} días
            </Link>
          );
        })}
      </nav>

      <section aria-label="Filtro de competiciones" className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Competiciones
          </h2>
          {selected.length > 0 ? (
            <Link
              href={analysisHref({ days, competitions: [] })}
              className="text-[11px] font-medium text-primary underline-offset-4 hover:underline"
            >
              Limpiar ({selected.length})
            </Link>
          ) : (
            <span className="text-[11px] text-muted-foreground">Todas</span>
          )}
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href={analysisHref({ days, competitions: [] })}
            aria-current={selected.length === 0 ? "true" : undefined}
            className={cn(
              "flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors",
              selected.length === 0
                ? "border-foreground/20 bg-foreground text-background"
                : "bg-background text-muted-foreground active:bg-muted",
            )}
          >
            Todas
          </Link>

          {competitions.map((competition) => {
            const active = selected.includes(competition.key);
            const next = active
              ? selected.filter((key) => key !== competition.key)
              : [...selected, competition.key];

            return (
              <Link
                key={competition.key}
                href={analysisHref({ days, competitions: next })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground active:bg-muted",
                )}
              >
                <span>{competition.label}</span>
                <span className="tabular-nums opacity-70">
                  {competition.count}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Puedes combinar varias competiciones.
        </p>
      </section>
    </div>
  );
}
