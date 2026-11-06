"use client";

import { useState } from "react";
import { CalendarSearch, Loader2, Search } from "lucide-react";

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

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

function formatKickoff(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

const STATUS_LABEL: Record<ApiEvent["status"], string> = {
  SCHEDULED: "Programado",
  LIVE: "En vivo",
  FINISHED: "Final",
  POSTPONED: "Pospuesto",
  CANCELLED: "Cancelado",
};

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

  const runSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchEventsAction({
        sport,
        competition: competition ?? undefined,
        from,
        to,
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

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setEvents(null);
          setError(null);
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
        className="max-h-[92dvh] overflow-y-auto rounded-t-2xl pb-6 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-2">
          <SheetTitle>Buscar evento</SheetTitle>
          <SheetDescription>
            {sport || "Deporte"}
            {competition ? ` · ${competition}` : ""}. Elige un partido para
            vincularlo y poder auto-liquidarlo.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
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

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          {events !== null && events.length === 0 && !loading && !error && (
            <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              No encontramos partidos para este deporte, competición y fechas.
            </p>
          )}

          {events !== null && events.length > 0 && (
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={`${event.provider}:${event.externalId}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(event);
                      setOpen(false);
                    }}
                    className="w-full rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm font-medium">
                        {event.home} vs. {event.away}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          event.status === "FINISHED" &&
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
                        {event.status === "FINISHED" &&
                        event.scoreHome !== null &&
                        event.scoreAway !== null
                          ? `${event.scoreHome}-${event.scoreAway}`
                          : STATUS_LABEL[event.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {event.competition} · {formatKickoff(event.kickoffUtc, timeZone)}
                    </p>
                    {event.status === "FINISHED" &&
                      event.autoSettleable === false && (
                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                          Marcador sin desglose de 90 minutos: no se
                          auto-liquidará.
                        </p>
                      )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            variant="ghost"
            className="h-10 w-full"
            onClick={() => setOpen(false)}
          >
            Ingresar manualmente
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
