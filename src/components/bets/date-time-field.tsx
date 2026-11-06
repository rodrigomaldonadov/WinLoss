"use client";

import { useState } from "react";
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
  /** Valor en formato `YYYY-MM-DDTHH:mm` (zona horaria del usuario). */
  value: string;
  onChange: (value: string) => void;
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

function shortDate(value: string): string {
  const date = parseDate(value);
  if (!date) return "Elegir fecha";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
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
  required,
  disabled,
  ...aria
}: DateTimeCompactProps) {
  const { date, time } = splitValue(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(
    () => parseDate(date) ?? new Date(),
  );

  const commitDate = (ymd: string) => {
    onChange(`${ymd}T${time || "12:00"}`);
    setOpen(false);
  };

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
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            data-invalid={aria["aria-invalid"] || undefined}
            aria-describedby={aria["aria-describedby"]}
            className={cn(
              "flex h-9 min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
              !date && "text-muted-foreground",
            )}
          >
            <CalendarDays
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="truncate">{shortDate(date)}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,20rem)] p-2" align="start">
          <Calendar
            month={month}
            onMonthChange={setMonth}
            selected={date}
            onSelect={commitDate}
          />
          <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                const ymd = `${today.getFullYear()}-${String(
                  today.getMonth() + 1,
                ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                commitDate(ymd);
              }}
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Hoy
            </button>
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
          </div>
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
