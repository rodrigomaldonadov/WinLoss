"use client";

import type { AutoSettleMode } from "@prisma/client";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  updateAutoSettleModeAction,
  type SettingsState,
} from "@/lib/actions/settings";
import { cn } from "@/lib/utils";

const initialState: SettingsState = {};

const OPTIONS: {
  value: AutoSettleMode;
  label: string;
  description: string;
}[] = [
  {
    value: "SUGGEST",
    label: "Sugerir y confirmar",
    description: "Revisa el resultado propuesto antes de aplicarlo.",
  },
  {
    value: "AUTO",
    label: "Aplicar automáticamente",
    description: "Liquida en cuanto el proveedor publica el resultado final.",
  },
];

type AutoSettlePreferenceProps = {
  mode: AutoSettleMode;
};

export function AutoSettlePreference({ mode }: AutoSettlePreferenceProps) {
  const [state, formAction, pending] = useActionState(
    updateAutoSettleModeAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) toast.success("Preferencia actualizada");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-2">
      {OPTIONS.map((option) => {
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="submit"
            name="mode"
            value={option.value}
            aria-pressed={active}
            disabled={pending}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
              active
                ? "border-primary bg-primary/10"
                : "bg-background hover:bg-muted/60",
            )}
          >
            <span
              className={cn(
                "block text-sm font-medium",
                active && "text-primary",
              )}
            >
              {option.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {option.description}
            </span>
          </button>
        );
      })}
    </form>
  );
}
