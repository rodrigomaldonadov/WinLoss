"use client";

import { useActionState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateResponsibleGamblingAction,
  type SettingsState,
} from "@/lib/actions/settings";

const initialState: SettingsState = {};

export function ResponsibleGambling({
  weeklyStakeLimit,
  selfExclusionUntil,
  timezone,
}: {
  weeklyStakeLimit: number | null;
  selfExclusionUntil: Date | null;
  timezone: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateResponsibleGamblingAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) toast.success("Preferencias de juego responsable guardadas");
    if (state.error) toast.error(state.error);
  }, [state]);

  const activeUntil =
    selfExclusionUntil && new Date(selfExclusionUntil) > new Date()
      ? new Date(selfExclusionUntil)
      : null;
  const untilLabel = activeUntil
    ? new Intl.DateTimeFormat("es-PE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(activeUntil)
    : null;

  return (
    <form action={formAction} className="space-y-4">
      {activeUntil && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="size-4" aria-hidden />
            Autoexclusión activa hasta el {untilLabel}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            No se puede cancelar antes de esa fecha. Mientras dure no podrás
            registrar apuestas.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="weekly-stake-limit">
            Límite semanal de stake (PEN)
          </Label>
          <Input
            id="weekly-stake-limit"
            name="weeklyStakeLimit"
            type="text"
            inputMode="decimal"
            placeholder="Sin límite"
            defaultValue={weeklyStakeLimit ?? ""}
            className="h-11 tabular-nums"
          />
          <p className="text-[11px] text-muted-foreground">
            Se suman las apuestas de la semana en curso (lunes a domingo). Vacío
            o 0 = sin límite.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="self-exclusion">Autoexclusión</Label>
          <select
            id="self-exclusion"
            name="selfExclusionDays"
            defaultValue={activeUntil ? "active" : "none"}
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {activeUntil && (
              <option value="active" disabled>
                Activa hasta el {untilLabel}
              </option>
            )}
            <option value="none" disabled={Boolean(activeUntil)}>
              Sin autoexclusión
            </option>
            <option value="1">24 horas</option>
            <option value="7">7 días</option>
            <option value="30">30 días</option>
          </select>
          <p className="text-[11px] text-muted-foreground">
            Bloquea nuevas apuestas durante el periodo. No se puede cancelar
            antes.
          </p>
        </div>
      </div>

      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending}>
        {pending ? "Guardando…" : "Guardar juego responsable"}
      </Button>
    </form>
  );
}
