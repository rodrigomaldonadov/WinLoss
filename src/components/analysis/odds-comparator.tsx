"use client";

import { useId, useState } from "react";
import { Scale } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Triple } from "@/lib/analysis/engine";
import {
  OUTCOMES,
  fairOdds,
  fairOddsDifference,
  type OutcomeKey,
} from "@/lib/analysis/view";
import { formatOdds, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

function emptyValues(): Record<OutcomeKey, string> {
  return { home: "", draw: "", away: "" };
}

export function comparisonText(
  input: string,
  fair: number | null,
): { text: string; tone: "neutral" | "better" | "worse" } {
  const parsed = Number(input.replace(",", "."));
  if (fair === null || !Number.isFinite(parsed) || parsed <= 1) {
    return {
      text: "Escribe una cuota mayor que 1 para comparar.",
      tone: "neutral",
    };
  }

  const delta = parsed / fair - 1;
  if (Math.abs(delta) < 0.0005) {
    return {
      text: "Tu cuota coincide con la cuota justa del mercado.",
      tone: "neutral",
    };
  }
  return {
    text: `${formatPercent(Math.abs(delta), { decimals: 0 })} ${
      delta > 0 ? "mejor" : "peor"
    } que la cuota justa del mercado.`,
    tone: delta > 0 ? "better" : "worse",
  };
}

export function BookmakerOddsComparator({
  market,
  model,
}: {
  market: Triple;
  model?: Triple | null;
}) {
  const inputId = useId();
  const [selected, setSelected] = useState<OutcomeKey>("home");
  const [values, setValues] = useState<Record<OutcomeKey, string>>(
    emptyValues,
  );
  const selectedOutcome = OUTCOMES.find((outcome) => outcome.key === selected)!;
  const fair = fairOdds(market[selected]);
  const result = comparisonText(values[selected], fair);

  return (
    <section
      aria-label="Comparador de cuotas justas"
      className="mt-3 rounded-lg border bg-muted/20 p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium">
          <Scale className="size-3.5" aria-hidden />
          Comparador de cuotas justas
        </p>
        <Badge variant="outline">Solo comparación</Badge>
      </div>
      <p className="mt-1 text-[0.625rem] leading-snug text-muted-foreground">
        Cuota justa = 1 / probabilidad del mercado sin margen. Escribe la cuota
        de tu casa para compararla.
      </p>

      <div
        role="group"
        aria-label="Resultado a comparar"
        className="mt-2 grid grid-cols-3 gap-1.5"
      >
        {OUTCOMES.map((outcome) => {
          const active = selected === outcome.key;
          return (
            <button
              key={outcome.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(outcome.key)}
              className={cn(
                "h-9 rounded-md border px-1 text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {outcome.short} · {outcome.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label
            htmlFor={inputId}
            className="text-[0.625rem] font-medium text-muted-foreground"
          >
            Cuota de tu casa ({selectedOutcome.label})
          </label>
          <Input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej. 2,10"
            value={values[selected]}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [selected]: event.target.value,
              }))
            }
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <p className="text-[0.625rem] font-medium text-muted-foreground">
            Cuota justa del mercado
          </p>
          <p className="flex h-9 items-center text-lg font-semibold tabular-nums">
            {fair === null ? "—" : formatOdds(fair)}
          </p>
        </div>
      </div>

      <p
        role="status"
        className={cn(
          "mt-1.5 rounded px-2 py-1 text-[0.6875rem] font-medium",
          result.tone === "better" && "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
          result.tone === "worse" && "bg-rose-500/10 text-rose-800 dark:text-rose-300",
          result.tone === "neutral" && "bg-muted/60 text-muted-foreground",
        )}
      >
        {result.text}
      </p>

      {model && (
        <div className="mt-2 border-t pt-2">
          <p className="text-[0.625rem] font-medium text-muted-foreground">
            Diferencia del modelo frente al mercado
          </p>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {OUTCOMES.map((outcome) => {
              const delta = fairOddsDifference(
                model[outcome.key],
                market[outcome.key],
              );
              return (
                <div
                  key={outcome.key}
                  className="rounded-md border bg-background px-1.5 py-1 text-center"
                >
                  <p className="text-[0.625rem] font-medium uppercase text-muted-foreground">
                    {outcome.short}
                  </p>
                  <p className="text-xs font-semibold tabular-nums">
                    {delta === null
                      ? "—"
                      : formatPercent(delta, {
                          decimals: 0,
                          signed: true,
                        })}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[0.625rem] leading-snug text-muted-foreground">
            Positivo: el modelo da más cuota (menos probabilidad que el
            mercado). Solo comparación, no es una recomendación.
          </p>
        </div>
      )}
    </section>
  );
}
