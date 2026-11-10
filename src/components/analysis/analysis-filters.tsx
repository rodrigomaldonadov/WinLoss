"use client";

import Link from "next/link";
import { Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
    <div className="flex items-center gap-1">
      {ANALYSIS_DAY_OPTIONS.map((option) => {
        const active = option === days;
        return (
          <Link
            key={option}
            href={analysisHref({ days: option, competitions: selected })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 shrink-0 items-center justify-center rounded-full border px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-muted-foreground active:bg-muted",
            )}
          >
            {option} días
          </Link>
        );
      })}

      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-11 gap-1 px-2.5 text-[11px]"
            aria-label="Abrir filtros"
          >
            <Filter className="size-3.5" aria-hidden />
            Filtros
            {selected.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                {selected.length}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>
              Puedes combinar varias competiciones.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-8">
            <div className="flex flex-wrap gap-2">
              <Link
                href={analysisHref({ days, competitions: [] })}
                aria-current={selected.length === 0 ? "true" : undefined}
                className={cn(
                  "flex h-11 items-center rounded-full border px-3 text-xs font-medium",
                  selected.length === 0
                    ? "border-foreground/20 bg-foreground text-background"
                    : "bg-background text-muted-foreground",
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
                      "flex h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-background text-muted-foreground",
                    )}
                  >
                    <span>{competition.label}</span>
                    <span className="tabular-nums opacity-60">
                      {competition.count}
                    </span>
                  </Link>
                );
              })}
            </div>
            {selected.length > 0 && (
              <Button asChild variant="outline" className="w-full">
                <Link href={analysisHref({ days, competitions: [] })}>
                  Limpiar competiciones
                </Link>
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

