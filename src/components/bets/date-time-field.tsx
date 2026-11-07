"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DateTimeCompactProps = {
  id?: string;
  /** Valor en formato `YYYY-MM-DDTHH:mm` o `YYYY-MM-DD` si `mode="date"`. */
  value: string;
  onChange: (value: string) => void;
  /** `date` oculta la hora y devuelve `YYYY-MM-DD`. */
  mode?: "datetime" | "date";
  /** Altura del botón; `default` iguala a los inputs de 44px. */
  size?: "sm" | "default";
  required?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

function splitValue(value: string): { date: string; time: string } {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function shortDate(value: string, withYear = false): string {
  const date = parseDate(value);
  if (!date) return "Elegir fecha";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
    .format(date)
    .replace(".", "");
}

/**
 * Fecha + hora compactas: botón con calendario (Popover) e input de hora.
 * El valor se mantiene como wall-time en la zona del usuario.
 */
export function DateTimeCompact({
  id,
  value,
  onChange,
  mode = "datetime",
  size = "sm",
  required,
  disabled,
  ...aria
}: DateTimeCompactProps) {
  const { date, time } = splitValue(value);
  const isDateOnly = mode === "date";
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(
    () => parseDate(date) ?? new Date(),
  );
  const inlinePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDateOnly || !open) return;

    const timer = setTimeout(() => {
      inlinePanelRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [isDateOnly, open]);

  const commitDate = (ymd: string) => {
    onChange(isDateOnly ? ymd : `${ymd}T${time || "12:00"}`);
    setOpen(false);
  };

  const selectToday = () => {
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    commitDate(ymd);
  };

  const trigger = (
    <button
      type="button"
      id={id}
      disabled={disabled}
      onClick={isDateOnly ? () => setOpen((current) => !current) : undefined}
      aria-expanded={isDateOnly ? open : undefined}
      aria-haspopup={isDateOnly ? "dialog" : undefined}
      data-invalid={aria["aria-invalid"] || undefined}
      aria-describedby={aria["aria-describedby"]}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        size === "default" ? "h-11" : "h-9",
        !date && "text-muted-foreground",
      )}
    >
      <CalendarDays
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span className="truncate">{shortDate(date, isDateOnly)}</span>
    </button>
  );

  const calendarFooter = (
    <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
      <button
        type="button"
        onClick={selectToday}
        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        Hoy
      </button>
      <div className="flex items-center gap-3">
        {!required && date && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
            Limpiar
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Cerrar
        </button>
      </div>
    </div>
  );

  if (isDateOnly) {
    /*
     * En móvil el popover puede quedar fuera del viewport cuando el campo está
     * cerca del borde inferior del sheet. En modo fecha mostramos el mismo
     * calendario inline para que siempre sea visible y el sheet haga scroll.
     */
    return (
      <div
        className="min-w-0 space-y-2"
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        {trigger}
        {open && (
          <div
            ref={inlinePanelRef}
            className="scroll-mt-2 rounded-xl border bg-popover p-2 shadow-sm"
          >
            <Calendar
              month={month}
              onMonthChange={setMonth}
              selected={date}
              onSelect={commitDate}
            />
            {calendarFooter}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          const parsed = parseDate(date);
          if (next && parsed) setMonth(parsed);
        }}
      >
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          className="w-[min(92vw,20rem)] p-2"
          align="start"
          collisionPadding={12}
        >
          <Calendar
            month={month}
            onMonthChange={setMonth}
            selected={date}
            onSelect={commitDate}
          />
          {calendarFooter}
        </PopoverContent>
      </Popover>

      <input
        type="time"
        aria-label="Hora"
        value={time}
        disabled={disabled || !date}
        onChange={(event) => {
          if (!date) return;
          onChange(`${date}T${event.target.value || "12:00"}`);
        }}
        className="h-9 w-24 min-w-0 appearance-none rounded-lg border border-input bg-transparent px-2 text-center text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      />
    </div>
  );
}
