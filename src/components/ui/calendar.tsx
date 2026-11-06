"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseYmd(value?: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

type CalendarProps = {
  month: Date;
  onMonthChange: (month: Date) => void;
  selected?: string;
  onSelect: (ymd: string) => void;
  className?: string;
};

/** Calendario mensual compacto (sin dependencias) con semana iniciando en lunes. */
export function Calendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  className,
}: CalendarProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const firstDay = new Date(year, monthIndex, 1);
  // getDay(): 0=domingo. Queremos lunes=0.
  const leading = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const monthLabel = new Intl.DateTimeFormat("es-PE", {
    month: "long",
    year: "numeric",
  }).format(firstDay);

  const todayYmd = toYmd(new Date());
  const selectedDate = parseYmd(selected);

  return (
    <div className={cn("w-full select-none", className)}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <p className="text-sm font-medium capitalize">{monthLabel}</p>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <span
            key={day}
            className="py-1 text-[11px] font-medium text-muted-foreground"
            aria-hidden
          >
            {day}
          </span>
        ))}

        {cells.map((day, index) => {
          if (day === null) {
            return <span key={`blank-${index}`} />;
          }

          const date = new Date(year, monthIndex, day, 12);
          const ymd = toYmd(date);
          const isSelected = selectedDate
            ? toYmd(selectedDate) === ymd
            : false;
          const isToday = ymd === todayYmd;

          return (
            <button
              key={ymd}
              type="button"
              aria-pressed={isSelected}
              aria-label={new Intl.DateTimeFormat("es-PE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(date)}
              onClick={() => onSelect(ymd)}
              className={cn(
                "flex size-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "hover:bg-muted",
                !isSelected && isToday && "ring-1 ring-inset ring-border",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
