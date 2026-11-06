"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarSearch,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { searchEventsAction } from "@/lib/actions/sports";
import {
  getCompetitionsForSport,
  groupCompetitionsByRegion,
} from "@/lib/catalogs/competitions";
import type { ApiEvent } from "@/lib/sports-api/types";
import { cn } from "@/lib/utils";

type EventSearchSheetProps = {
  sport: string;
  competition?: string | null;
  timeZone?: string;
  disabled?: boolean;
  /** Selección simple (rellena este leg). */
  onSelect?: (event: ApiEvent) => void;
  /** Selección múltiple (crea varios legs). */
  onSelectMany?: (events: ApiEvent[]) => void;
};

const MAX_COMPETITIONS = 5;

const PROVIDER_LABEL: Record<string, string> = {
  "football-data": "football-data",
  thesportsdb: "TheSportsDB",
  fake: "Demo",
};

const STATUS_LABEL: Record<ApiEvent["status"], string> = {
  SCHEDULED: "Programado",
  LIVE: "En vivo",
  FINISHED: "Final",
  POSTPONED: "Pospuesto",
  CANCELLED: "Cancelado",
};

const FAVORITES_KEY = "winloss:competition-usage:v1";

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

function parseYmd(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function timeLabel(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function dayLabel(value: string): string {
  const today = ymd(new Date());
  if (value === today) return "Hoy";
  if (value === ymd(addDays(new Date(), -1))) return "Ayer";
  if (value === ymd(addDays(new Date(), 1))) return "Mañana";
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(parseYmd(value));
}

function matchesQuery(event: ApiEvent, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return `${event.home} ${event.away} ${event.competition}`
    .toLowerCase()
    .includes(normalized);
}

function readUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "{}") as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
}

function bumpUsage(labels: string[]) {
  try {
    const usage = readUsage();
    for (const label of labels) {
      if (label) usage[label] = (usage[label] ?? 0) + 1;
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(usage));
  } catch {
    // sin storage
  }
}

export function EventSearchSheet({
  sport,
  competition,
  timeZone,
  disabled,
  onSelect,
  onSelectMany,
}: EventSearchSheetProps) {
  const multiple = Boolean(onSelectMany);
  const today = ymd(new Date());
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => parseYmd(today));
  const [selectedCompetitions, setSelectedCompetitions] = useState<string[]>(
    competition ? [competition] : [],
  );
  const [competitionPickerOpen, setCompetitionPickerOpen] = useState(false);
  const [competitionQuery, setCompetitionQuery] = useState("");
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const competitions = useMemo(() => getCompetitionsForSport(sport), [sport]);
  const groupedCompetitions = useMemo(
    () => groupCompetitionsByRegion(competitions),
    [competitions],
  );
  const filteredCompetitions = useMemo(() => {
    const normalized = competitionQuery.trim().toLowerCase();
    if (!normalized) return groupedCompetitions;
    return groupedCompetitions
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(normalized) ||
            item.region.toLowerCase().includes(normalized),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groupedCompetitions, competitionQuery]);

  const filteredEvents = useMemo(
    () => events.filter((event) => matchesQuery(event, query)),
    [events, query],
  );

  const eventsByCompetition = useMemo(() => {
    const map = new Map<string, ApiEvent[]>();
    for (const event of filteredEvents) {
      const list = map.get(event.competition) ?? [];
      list.push(event);
      map.set(event.competition, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEvents]);

  const selectedEvents = useMemo(
    () => events.filter((event) => selectedIds.has(event.externalId)),
    [events, selectedIds],
  );

  const favorites = useMemo(() => {
    const usage = readUsage();
    return [...competitions]
      .sort((a, b) => (usage[b.label] ?? 0) - (usage[a.label] ?? 0))
      .filter((item) => (usage[item.label] ?? 0) > 0)
      .slice(0, MAX_COMPETITIONS)
      .map((item) => item.label);
  }, [competitions]);

  const runOne = async (competitionLabel: string, targetDay: string) => {
    const result = await searchEventsAction({
      sport,
      competition: competitionLabel,
      from: targetDay,
      to: targetDay,
    });
    if (!result.ok) return [] as ApiEvent[];
    return result.events;
  };

  const runSearch = async (
    targetDay = day,
    list = selectedCompetitions,
  ) => {
    if (!sport.trim()) {
      setEvents([]);
      setError(null);
      return;
    }
    if (list.length === 0) {
      setEvents([]);
      setError("Elige al menos una competición.");
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    setEvents([]);
    setProgress({ done: 0, total: list.length, current: list[0] ?? "" });

    const collected: ApiEvent[] = [];
    for (let index = 0; index < list.length; index += 1) {
      const label = list[index]!;
      setProgress({ done: index, total: list.length, current: label });
      try {
        const batch = await runOne(label, targetDay);
        collected.push(...batch);
        setEvents([...collected]);
      } catch {
        // continúa con la siguiente competición
      }
      setProgress({ done: index + 1, total: list.length, current: label });
    }

    setLoading(false);
  };

  const addCompetition = (label: string) => {
    if (selectedCompetitions.includes(label)) {
      setSelectedCompetitions((current) =>
        current.filter((item) => item !== label),
      );
      setCompetitionPickerOpen(false);
      return;
    }
    if (selectedCompetitions.length >= MAX_COMPETITIONS) return;
    const next = [...selectedCompetitions, label];
    setSelectedCompetitions(next);
    bumpUsage([label]);
    setCompetitionPickerOpen(false);
    void runSearch(day, next);
  };

  const changeDay = (next: string) => {
    setDay(next);
    setCalendarOpen(false);
    void runSearch(next, selectedCompetitions);
  };

  const goToDay = (offset: number) => {
    changeDay(ymd(addDays(new Date(), offset)));
  };

  const toggleEvent = (event: ApiEvent) => {
    if (!multiple) {
      onSelect?.(event);
      setOpen(false);
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(event.externalId)) next.delete(event.externalId);
      else next.add(event.externalId);
      return next;
    });
  };

  const confirmSelection = () => {
    if (!onSelectMany || selectedEvents.length === 0) return;
    bumpUsage(selectedCompetitions);
    onSelectMany(selectedEvents);
    setOpen(false);
  };

  const hasSport = Boolean(sport.trim());

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setEvents([]);
          setError(null);
          setQuery("");
          setSelectedIds(new Set());
          const initial = competition ? [competition] : [];
          setSelectedCompetitions(initial);
          setDay(today);
          if (initial.length > 0) void runSearch(today, initial);
        }
      }}
    >
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-full gap-1.5 text-xs"
          disabled={disabled}
        >
          <CalendarSearch className="size-4" aria-hidden />
          Buscar evento
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-2xl pb-0 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-3 pr-10">
          <SheetTitle>Buscar eventos</SheetTitle>
          <SheetDescription>
            Un día, hasta {MAX_COMPETITIONS} competiciones
            {multiple ? " y varios partidos a la vez" : ""}.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {!hasSport ? (
            <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center">
              <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-2 text-sm font-medium">Primero elige un deporte</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Selecciona deporte y competición en el formulario, o ingresa el
                evento manualmente.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Día único */}
              <div className="space-y-1.5">
                <Label className="text-xs">Día</Label>
                <div className="flex gap-1.5">
                  {(
                    [
                      [-1, "Ayer"],
                      [0, "Hoy"],
                      [1, "Mañana"],
                    ] as const
                  ).map(([offset, label]) => {
                    const value = ymd(addDays(new Date(), offset));
                    const active = day === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => goToDay(offset)}
                        className={cn(
                          "h-9 flex-1 rounded-lg border text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "bg-background text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="Elegir otro día"
                        onClick={() => setCalendarMonth(parseYmd(day))}
                        className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border bg-background text-xs font-medium text-muted-foreground hover:bg-muted"
                      >
                        <CalendarDays className="size-3.5" aria-hidden />
                        Otro
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(92vw,20rem)] p-2" align="end">
                      <Calendar
                        month={calendarMonth}
                        onMonthChange={setCalendarMonth}
                        selected={day}
                        onSelect={(value) => {
                          changeDay(value);
                          setCalendarOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {dayLabel(day)} · zona {timeZone ?? "local"}
                </p>
              </div>

              {/* Competiciones */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">Competiciones</Label>
                  <div className="flex gap-1">
                    {favorites.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCompetitions(favorites);
                          void runSearch(day, favorites);
                        }}
                        className="text-[11px] font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Favoritas
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const top = competitions
                          .slice(0, MAX_COMPETITIONS)
                          .map((item) => item.label);
                        setSelectedCompetitions(top);
                        void runSearch(day, top);
                      }}
                      className="text-[11px] font-medium text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Todas (máx. {MAX_COMPETITIONS})
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {selectedCompetitions.map((label) => (
                    <span
                      key={label}
                      className="flex h-8 items-center gap-1 rounded-full bg-primary/10 pl-2.5 pr-1 text-xs font-medium text-primary"
                    >
                      <span className="max-w-40 truncate">{label}</span>
                      <button
                        type="button"
                        aria-label={`Quitar ${label}`}
                        onClick={() => {
                          const next = selectedCompetitions.filter(
                            (item) => item !== label,
                          );
                          setSelectedCompetitions(next);
                          void runSearch(day, next);
                        }}
                        className="flex size-6 items-center justify-center rounded-full hover:bg-primary/20"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  ))}

                  {selectedCompetitions.length < MAX_COMPETITIONS && (
                    <Popover
                      open={competitionPickerOpen}
                      onOpenChange={(next) => {
                        setCompetitionPickerOpen(next);
                        if (!next) setCompetitionQuery("");
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex h-8 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                        >
                          <Plus className="size-3.5" aria-hidden />
                          Añadir
                          <ChevronDown className="size-3.5" aria-hidden />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(92vw,22rem)] p-0" align="start">
                        <div className="border-b p-2">
                          <Input
                            autoFocus
                            value={competitionQuery}
                            onChange={(event) =>
                              setCompetitionQuery(event.target.value)
                            }
                            placeholder="Buscar liga o región"
                            aria-label="Buscar competición"
                            className="h-10"
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto p-1">
                          {filteredCompetitions.length === 0 ? (
                            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                              Sin resultados.
                            </p>
                          ) : (
                            filteredCompetitions.map((group) => (
                              <div key={group.region} className="mb-1">
                                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {group.region}
                                </p>
                                {group.items.map((item) => {
                                  const active = selectedCompetitions.includes(
                                    item.label,
                                  );
                                  const disabledAdd =
                                    !active &&
                                    selectedCompetitions.length >=
                                      MAX_COMPETITIONS;
                                  return (
                                    <button
                                      key={item.value}
                                      type="button"
                                      disabled={disabledAdd}
                                      onClick={() => addCompetition(item.label)}
                                      className={cn(
                                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-40",
                                        active && "bg-muted",
                                      )}
                                    >
                                      <Check
                                        className={cn(
                                          "size-4 shrink-0",
                                          active ? "opacity-100" : "opacity-0",
                                        )}
                                        aria-hidden
                                      />
                                      <span className="truncate">
                                        {item.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ))
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  className="h-10 flex-1 gap-2"
                  onClick={() => void runSearch()}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Search className="size-4" aria-hidden />
                  )}
                  {loading ? "Buscando…" : "Buscar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  aria-label="Actualizar resultados"
                  onClick={() => void runSearch()}
                  disabled={loading}
                >
                  <RefreshCw className="size-4" aria-hidden />
                </Button>
              </div>

              {loading && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    Buscando {progress.current} ({progress.done + 1}/
                    {progress.total})…
                  </p>
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              )}

              {!loading && error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}

              {!loading && !error && events.length === 0 && (
                <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center">
                  <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden />
                  <p className="mt-2 text-sm font-medium">
                    Sin partidos para este día
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prueba otro día o añade otra competición.
                  </p>
                </div>
              )}

              {events.length > 0 && (
                <>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Filtrar por equipo"
                      aria-label="Filtrar resultados"
                      className="h-10 pl-8"
                    />
                  </div>

                  {selectedEvents.length > 0 && (
                    <p className="text-xs font-medium text-primary" aria-live="polite">
                      {selectedEvents.length} partido
                      {selectedEvents.length === 1 ? "" : "s"} seleccionado
                      {selectedEvents.length === 1 ? "" : "s"}
                    </p>
                  )}

                  <div className="space-y-4">
                    {eventsByCompetition.map(([competitionName, list]) => (
                      <section key={competitionName}>
                        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {competitionName}
                        </h3>
                        <ul className="space-y-2">
                          {list.map((event) => {
                            const selected = selectedIds.has(event.externalId);
                            const finished = event.status === "FINISHED";
                            const hasScore =
                              finished &&
                              event.scoreHome !== null &&
                              event.scoreAway !== null;
                            return (
                              <li key={`${event.provider}:${event.externalId}`}>
                                <button
                                  type="button"
                                  onClick={() => toggleEvent(event)}
                                  aria-pressed={multiple ? selected : undefined}
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                                    selected
                                      ? "border-primary bg-primary/5"
                                      : "bg-background hover:bg-muted/60",
                                  )}
                                >
                                  {multiple && (
                                    <span
                                      aria-hidden
                                      className={cn(
                                        "flex size-6 shrink-0 items-center justify-center rounded-md border",
                                        selected
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "border-input",
                                      )}
                                    >
                                      {selected && <Check className="size-4" />}
                                    </span>
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-start justify-between gap-2">
                                      <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
                                        {event.home} vs. {event.away}
                                      </span>
                                      <span
                                        className={cn(
                                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                                          finished &&
                                            "bg-muted text-muted-foreground",
                                          event.status === "LIVE" &&
                                            "bg-destructive/10 text-destructive",
                                          event.status === "SCHEDULED" &&
                                            "bg-primary/10 text-primary",
                                          (event.status === "POSTPONED" ||
                                            event.status === "CANCELLED") &&
                                            "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                                        )}
                                      >
                                        {hasScore
                                          ? `Final ${event.scoreHome}-${event.scoreAway}`
                                          : STATUS_LABEL[event.status]}
                                      </span>
                                    </span>
                                    <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                                      <span className="shrink-0 tabular-nums">
                                        {timeLabel(event.kickoffUtc, timeZone)}
                                      </span>
                                      <span aria-hidden>·</span>
                                      <span className="shrink-0 text-[10px]">
                                        {PROVIDER_LABEL[event.provider] ??
                                          event.provider}
                                      </span>
                                    </span>
                                    {finished && event.autoSettleable === false && (
                                      <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">
                                        Sin desglose de 90 minutos: no se
                                        auto-liquidará.
                                      </span>
                                    )}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-popover/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          {multiple && selectedEvents.length > 0 ? (
            <Button
              type="button"
              className="h-12 w-full"
              onClick={confirmSelection}
            >
              Añadir {selectedEvents.length} partido
              {selectedEvents.length === 1 ? "" : "s"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => setOpen(false)}
            >
              Ingresar manualmente
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
