"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  formatLine,
  normalizeLine,
  stepLine,
} from "@/lib/line-utils";
import { cn } from "@/lib/utils";

type LinePickerProps = {
  pick: string;
  onPickChange: (pick: string) => void;
  line: string;
  onLineChange: (line: string) => void;
  presets: readonly number[];
  min?: number;
  max?: number;
  hint?: string;
  overLabel?: string;
  underLabel?: string;
};

/**
 * Selector táctil de línea: Más/Menos, chips comunes, stepper de 0.5 y
 * edición exacta (admite cuartos como 2.25 o 2.75).
 */
export function LinePicker({
  pick,
  onPickChange,
  line,
  onLineChange,
  presets,
  min = 0.25,
  max = 30,
  hint = "También puedes escribir líneas de cuarto: 2.25, 2.75…",
  overLabel = "Más de",
  underLabel = "Menos de",
}: LinePickerProps) {
  const numeric = normalizeLine(line, { min, max }) ?? presets[0] ?? 0.5;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatLine(numeric));

  const commit = () => {
    const parsed = normalizeLine(draft, { min, max });
    if (parsed !== null) onLineChange(formatLine(parsed));
    setEditing(false);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { value: "OVER", label: overLabel },
          { value: "UNDER", label: underLabel },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={pick === option.value}
            onClick={() => onPickChange(option.value)}
            className={cn(
              "flex h-11 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
              pick === option.value
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-muted-foreground active:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {presets.map((preset) => {
          const active = Math.abs(preset - numeric) < 0.001;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => onLineChange(formatLine(preset))}
              className={cn(
                "h-9 shrink-0 rounded-lg border px-3 text-xs font-medium tabular-nums transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background text-muted-foreground active:bg-muted",
              )}
            >
              {formatLine(preset)}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Restar 0.5"
          onClick={() => onLineChange(formatLine(stepLine(numeric, -0.5, { min, max })))}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground active:bg-muted"
        >
          <Minus className="size-4" aria-hidden />
        </button>

        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape") setEditing(false);
            }}
            inputMode="decimal"
            aria-label="Línea exacta"
            className="h-11 flex-1 text-center text-base font-semibold tabular-nums"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(formatLine(numeric));
              setEditing(true);
            }}
            aria-label="Editar línea exacta"
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-input bg-muted/30 text-base font-semibold tabular-nums"
          >
            {formatLine(numeric)}
          </button>
        )}

        <button
          type="button"
          aria-label="Sumar 0.5"
          onClick={() => onLineChange(formatLine(stepLine(numeric, 0.5, { min, max })))}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground active:bg-muted"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>

      <p className="text-[0.6875rem] text-muted-foreground">{hint}</p>
    </div>
  );
}
