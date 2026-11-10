"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Filter, Ticket, X } from "lucide-react";

import { HistoryTeamSearch } from "@/components/analysis/history-team-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  HISTORY_MODES,
  HISTORY_MODE_LABELS,
  historyHref,
  type HistoryFilterState,
  type HistoryPresets,
} from "@/lib/analysis/history";
import { cn } from "@/lib/utils";

export type HistoryCompetitionOption = {
  name: string;
  count: number;
};

export type HistoryFiltersProps = {
  filters: HistoryFilterState;
  competitions: HistoryCompetitionOption[];
  matchedTeams: { id: string; name: string }[];
  presets: HistoryPresets;
};

const MAX_COMPETITION_CHIPS = 40;

/** "2026-11-01" → "01 nov", sin depender de la zona del navegador. */
function shortDate(key: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00.000Z`));
}

const chipBase =
  "flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const chipActive = "border-primary bg-primary/10 text-primary";
const chipIdle = "bg-background text-muted-foreground active:bg-muted";

function hiddenParams(
  filters: HistoryFilterState,
  { includeDates = true }: { includeDates?: boolean } = {},
) {
  return (
    <>
      {filters.query && <input type="hidden" name="q" value={filters.query} />}
      {filters.competitions.map((competition) => (
        <input
          key={competition}
          type="hidden"
          name="competicion"
          value={competition}
        />
      ))}
      {includeDates && filters.from && (
        <input type="hidden" name="desde" value={filters.from} />
      )}
      {includeDates && filters.to && (
        <input type="hidden" name="hasta" value={filters.to} />
      )}
      {filters.mode !== "all" && (
        <input type="hidden" name="modo" value={filters.mode} />
      )}
      {filters.mine && <input type="hidden" name="mios" value="1" />}
    </>
  );
}

export function HistoryFilters({
  filters,
  competitions,
  matchedTeams,
  presets,
}: HistoryFiltersProps) {
  const visibleCompetitions = competitions.slice(0, MAX_COMPETITION_CHIPS);
  const [competitionQuery, setCompetitionQuery] = useState("");
  const filteredCompetitions = visibleCompetitions.filter((competition) =>
    competition.name
      .toLowerCase()
      .includes(competitionQuery.trim().toLowerCase()),
  );

  const activeChips = [
    ...(filters.query
      ? [
          {
            label: `Equipo: ${filters.query}`,
            href: historyHref({ ...filters, query: "", page: 1 }),
          },
        ]
      : []),
    ...filters.competitions.map((competition) => ({
      label: competition,
      href: historyHref({
        ...filters,
        competitions: filters.competitions.filter(
          (item) => item !== competition,
        ),
        page: 1,
      }),
    })),
    ...(filters.from
      ? [
          {
            label: `Desde: ${shortDate(filters.from)}`,
            href: historyHref({ ...filters, from: null, page: 1 }),
          },
        ]
      : []),
    ...(filters.to
      ? [
          {
            label: `Hasta: ${shortDate(filters.to)}`,
            href: historyHref({ ...filters, to: null, page: 1 }),
          },
        ]
      : []),
    ...(filters.mode !== "all"
      ? [
          {
            label: `Modo: ${HISTORY_MODE_LABELS[filters.mode]}`,
            href: historyHref({ ...filters, mode: "all", page: 1 }),
          },
        ]
      : []),
    ...(filters.mine
      ? [
          {
            label: "Mis partidos",
            href: historyHref({ ...filters, mine: false, page: 1 }),
          },
        ]
      : []),
  ];
  const hasActiveFilters = activeChips.length > 0;

  return (
    <div className="space-y-1.5">
      <form action="/analysis/historial" method="get" role="search">
        {hiddenParams(filters)}
        <HistoryTeamSearch key={filters.query} filters={filters} />
      </form>

      {filters.query && matchedTeams.length > 0 && (
        <p className="truncate px-0.5 text-[0.6875rem] text-muted-foreground">
          {matchedTeams.length === 1 ? "Equipo: " : "Equipos: "}
          {matchedTeams
            .slice(0, 3)
            .map((team) => team.name)
            .join(", ")}
          {matchedTeams.length > 3 ? ` y ${matchedTeams.length - 3} más` : ""}
        </p>
      )}

      <div className="flex items-center gap-1">
        <nav
          aria-label="Filtros rápidos"
          className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Link
            href={presets.week.href}
            aria-current={presets.week.active ? "page" : undefined}
            className={cn(
              chipBase,
              presets.week.active ? chipActive : chipIdle,
            )}
          >
            Última semana
          </Link>
          <Link
            href={presets.month.href}
            aria-current={presets.month.active ? "page" : undefined}
            className={cn(
              chipBase,
              presets.month.active ? chipActive : chipIdle,
            )}
          >
            Último mes
          </Link>
          <Link
            href={historyHref({ ...filters, mine: !filters.mine, page: 1 })}
            aria-current={filters.mine ? "true" : undefined}
            className={cn(chipBase, filters.mine ? chipActive : chipIdle)}
          >
            <Ticket className="size-3.5" aria-hidden />
            Mis partidos
          </Link>
        </nav>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1 px-2.5 text-xs"
              aria-label="Abrir filtros del historial"
            >
              <Filter className="size-3.5" aria-hidden />
              Filtros
              {hasActiveFilters && (
                <span className="rounded-full bg-primary/10 px-1 text-[0.625rem] font-semibold text-primary">
                  {activeChips.length}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filtros del historial</SheetTitle>
              <SheetDescription>
                Combina equipo, competiciones, fechas y modo de la captura.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-8">
              <section aria-labelledby="filtro-competiciones" className="space-y-2">
                <h3
                  id="filtro-competiciones"
                  className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Competiciones
                </h3>
                <Input
                  value={competitionQuery}
                  onChange={(event) => setCompetitionQuery(event.target.value)}
                  placeholder="Filtrar competiciones"
                  aria-label="Filtrar competiciones"
                  autoComplete="off"
                  className="h-10 text-sm"
                />
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    href={historyHref({
                      ...filters,
                      competitions: [],
                      page: 1,
                    })}
                    aria-current={
                      filters.competitions.length === 0 ? "true" : undefined
                    }
                    className={cn(
                      chipBase,
                      filters.competitions.length === 0
                        ? "border-foreground/20 bg-foreground text-background"
                        : chipIdle,
                    )}
                  >
                    Todas
                  </Link>
                  {filteredCompetitions.map((competition) => {
                    const active = filters.competitions.includes(
                      competition.name,
                    );
                    const next = active
                      ? filters.competitions.filter(
                          (item) => item !== competition.name,
                        )
                      : [...filters.competitions, competition.name];
                    return (
                      <Link
                        key={competition.name}
                        href={historyHref({
                          ...filters,
                          competitions: next,
                          page: 1,
                        })}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          chipBase,
                          active
                            ? chipActive
                            : "bg-background text-muted-foreground active:bg-muted",
                        )}
                      >
                        <span className="max-w-40 truncate">
                          {competition.name}
                        </span>
                        <span className="tabular-nums opacity-60">
                          {competition.count}
                        </span>
                      </Link>
                    );
                  })}
                </div>
                {filteredCompetitions.length === 0 && (
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Sin competiciones con ese nombre.
                  </p>
                )}
                {competitions.length > MAX_COMPETITION_CHIPS && (
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Se muestran las {MAX_COMPETITION_CHIPS} competiciones con
                    más partidos.
                  </p>
                )}
              </section>

              <section aria-labelledby="filtro-modo" className="space-y-2">
                <h3
                  id="filtro-modo"
                  className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Captura del análisis
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {HISTORY_MODES.map((mode) => {
                    const active = filters.mode === mode;
                    return (
                      <Link
                        key={mode}
                        href={historyHref({ ...filters, mode, page: 1 })}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          chipBase,
                          active
                            ? chipActive
                            : "bg-background text-muted-foreground active:bg-muted",
                        )}
                      >
                        {mode === "all"
                          ? "Todas"
                          : mode === "saved"
                            ? "Guardada antes del inicio"
                            : "Reconstruida"}
                      </Link>
                    );
                  })}
                </div>
                <p className="text-[0.6875rem] text-muted-foreground">
                  “Guardada” usa la captura previa al inicio; “Reconstruida”
                  recalcula con los ratings de esa semana.
                </p>
              </section>

              <section aria-labelledby="filtro-fechas" className="space-y-2">
                <h3
                  id="filtro-fechas"
                  className="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <CalendarDays className="size-3.5" aria-hidden />
                  Fechas
                </h3>
                <form
                  action="/analysis/historial"
                  method="get"
                  className="space-y-2"
                >
                  {hiddenParams(filters, { includeDates: false })}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[0.6875rem] font-medium text-muted-foreground">
                        Desde
                      </span>
                      <Input
                        type="date"
                        name="desde"
                        defaultValue={filters.from ?? ""}
                        className="h-10 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[0.6875rem] font-medium text-muted-foreground">
                        Hasta
                      </span>
                      <Input
                        type="date"
                        name="hasta"
                        defaultValue={filters.to ?? ""}
                        className="h-10 text-sm"
                      />
                    </label>
                  </div>
                  <Button type="submit" className="h-10 w-full">
                    Aplicar fechas
                  </Button>
                </form>
                {(filters.from || filters.to) && (
                  <Button
                    asChild
                    variant="outline"
                    className="h-10 w-full"
                  >
                    <Link
                      href={historyHref({
                        ...filters,
                        from: null,
                        to: null,
                        page: 1,
                      })}
                    >
                      Quitar fechas
                    </Link>
                  </Button>
                )}
              </section>

              <Button asChild variant="ghost" className="h-10 w-full">
                <Link href="/analysis/historial">Limpiar filtros</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {hasActiveFilters && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Filtros activos"
        >
          {activeChips.map((chip) => (
            <Link
              key={`${chip.label}-${chip.href}`}
              href={chip.href}
              className="inline-flex h-9 max-w-full items-center gap-1 rounded-full border bg-muted/40 pr-1.5 pl-2.5 text-xs font-medium text-foreground"
            >
              <span className="truncate">{chip.label}</span>
              <X className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
          <Link
            href="/analysis/historial"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Limpiar todo
          </Link>
        </div>
      )}
    </div>
  );
}
