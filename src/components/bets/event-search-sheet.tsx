"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarSearch,
  Loader2,
  RefreshCw,
  Search,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { ApiEvent } from "@/lib/sports-api/types";
import { cn } from "@/lib/utils";

type EventSearchSheetProps = {
  sport: string;
  competition?: string | null;
  timeZone?: string;
  disabled?: boolean;
  onSelect: (event: ApiEvent) => void;
};

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

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

function dayKey(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
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

function dayLabel(key: string, timeZone?: string): string {
  const today = dayKey(new Date().toISOString(), timeZone);
  const tomorrow = dayKey(addDays(new Date(), 1).toISOString(), timeZone);
  if (key === today) return "Hoy";
  if (key === tomorrow) return "Mañana";

  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function matchesQuery(event: ApiEvent, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return `${event.home} ${event.away} ${event.competition}`
    .toLowerCase()
    .includes(normalized);
}

export function EventSearchSheet({
  sport,
  competition,
  timeZone,
  disabled,
  onSelect,
}: EventSearchSheetProps) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(ymd(addDays(today, -3)));
  const [to, setTo] = useState(ymd(addDays(today, 3)));
  const [events, setEvents] = useState<ApiEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => (events ?? []).filter((event) => matchesQuery(event, query)),
    [events, query],
  );

  const groups = useMemo(() => {
    const map = new Map<string, ApiEvent[]>();
    for (const event of filtered) {
      const key = dayKey(event.kickoffUtc, timeZone);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, timeZone]);

  const runSearch = async (range?: { from: string; to: string }) => {
    if (!sport.trim()) {
      setEvents([]);
      setError(null);
      return;
    }

    const start = range?.from ?? from;
    const end = range?.to ?? to;
    setFrom(start);
    setTo(end);
    setLoading(true);
    setError(null);
    setQuery("");

    try {
      const result = await searchEventsAction({
        sport,
        competition: competition ?? undefined,
        from: start,
        to: end,
      });
      if (!result.ok) {
        setError(result.error);
        setEvents([]);
      } else {
        setEvents(result.events);
      }
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: "today" | "around" | "next7") => {
    const base = new Date();
    const range =
      preset === "today"
        ? { from: ymd(base), to: ymd(base) }
        : preset === "next7"
          ? { from: ymd(base), to: ymd(addDays(base, 7)) }
          : { from: ymd(addDays(base, -3)), to: ymd(addDays(base, 3)) };
    void runSearch(range);
  };

  const isPresetActive = (preset: "today" | "around" | "next7") => {
    const base = new Date();
    const range =
      preset === "today"
        ? { from: ymd(base), to: ymd(base) }
        : preset === "next7"
          ? { from: ymd(base), to: ymd(addDays(base, 7)) }
          : { from: ymd(addDays(base, -3)), to: ymd(addDays(base, 3)) };
    return from === range.from && to === range.to;
  };

  const hasSport = Boolean(sport.trim());

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setEvents(null);
          setError(null);
          setQuery("");
          void runSearch();
        }
      }}
    >
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-xs"
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
          <SheetTitle>Buscar evento</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
              {sport || "Sin deporte"}
            </span>
            {competition && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                {competition}
              </span>
            )}
            <span className="text-xs">
              Elige un partido para vincularlo y poder auto-liquidarlo.
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {!hasSport ? (
            <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center">
              <CalendarDays
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden
              />
              <p className="mt-2 text-sm font-medium">
                Primero elige un deporte
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Selecciona el deporte y la competición en el formulario para
                buscar partidos. También puedes ingresar el evento manualmente.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Rangos rápidos */}
              <div className="flex gap-1.5">
                {(
                  [
                    ["today", "Hoy"],
                    ["around", "±3 días"],
                    ["next7", "Próximos 7"],
                  ] as const
                ).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    disabled={loading}
                    aria-pressed={isPresetActive(preset)}
                    className={cn(
                      "flex h-9 flex-1 items-center justify-center rounded-lg border text-xs font-medium transition-colors disabled:opacity-50",
                      isPresetActive(preset)
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="event-from" className="text-xs">
                    Desde
                  </Label>
                  <Input
                    id="event-from"
                    type="date"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="event-to" className="text-xs">
                    Hasta
                  </Label>
                  <Input
                    id="event-to"
                    type="date"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    className="h-10"
                  />
                </div>
              </div>

              <Button
                type="button"
                className="h-10 w-full gap-2"
                onClick={() => void runSearch()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="size-4" aria-hidden />
                )}
                {loading ? "Buscando…" : "Buscar partidos"}
              </Button>

              {loading && (
                <div className="space-y-2" aria-hidden>
                  {[0, 1, 2].map((index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {!loading && error && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive"
                >
                  <p>{error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-8 gap-1.5"
                    onClick={() => void runSearch()}
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Reintentar
                  </Button>
                </div>
              )}

              {!loading && !error && events !== null && events.length === 0 && (
                <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center">
                  <CalendarDays
                    className="mx-auto size-8 text-muted-foreground"
                    aria-hidden
                  />
                  <p className="mt-2 text-sm font-medium">
                    Sin partidos en estas fechas
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prueba a ampliar el rango o cambia de competición. Siempre
                    puedes ingresar el evento a mano.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 h-9"
                    onClick={() => applyPreset("next7")}
                  >
                    Ampliar a 7 días
                  </Button>
                </div>
              )}

              {!loading && !error && events !== null && events.length > 0 && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className="text-xs font-medium text-muted-foreground"
                      aria-live="polite"
                    >
                      {filtered.length} partido
                      {filtered.length === 1 ? "" : "s"}
                      {query ? " filtrados" : ""}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => void runSearch()}
                    >
                      <RefreshCw className="size-3.5" aria-hidden />
                      Actualizar
                    </Button>
                  </div>

                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Filtrar por equipo o liga"
                      aria-label="Filtrar resultados"
                      className="h-10 pl-8"
                    />
                  </div>

                  {filtered.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                      Ningún partido coincide con “{query}”.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {groups.map(([key, dayEvents]) => (
                        <section key={key} aria-label={dayLabel(key, timeZone)}>
                          <h3 className="mb-1.5 text-[11px] font-semibold capitalize tracking-wide text-muted-foreground">
                            {dayLabel(key, timeZone)}
                          </h3>
                          <ul className="space-y-2">
                            {dayEvents.map((event) => {
                              const finished = event.status === "FINISHED";
                              const hasScore =
                                finished &&
                                event.scoreHome !== null &&
                                event.scoreAway !== null;
                              return (
                                <li
                                  key={`${event.provider}:${event.externalId}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onSelect(event);
                                      setOpen(false);
                                    }}
                                    className="w-full rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
                                        {event.home} vs. {event.away}
                                      </p>
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
                                    </div>
                                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                                      <span className="truncate">
                                        {event.competition}
                                      </span>
                                      <span aria-hidden>·</span>
                                      <span className="shrink-0 tabular-nums">
                                        {timeLabel(event.kickoffUtc, timeZone)}
                                      </span>
                                      <span aria-hidden>·</span>
                                      <span className="shrink-0 text-[10px] text-muted-foreground/70">
                                        {PROVIDER_LABEL[event.provider] ??
                                          event.provider}
                                      </span>
                                    </p>
                                    {finished && event.autoSettleable === false && (
                                      <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                                        Sin desglose de 90 minutos: no se
                                        auto-liquidará.
                                      </p>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* CTA fijo: siempre alcanzable en móvil */}
        <div className="shrink-0 border-t bg-popover/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full gap-1.5"
            onClick={() => setOpen(false)}
          >
            <Undo2 className="size-4" aria-hidden />
            Ingresar manualmente
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
