"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  updateDebtPreferencesAction,
  type SettingsState,
} from "@/lib/actions/settings";

const initialState: SettingsState = {};

type DebtPreferencesProps = {
  usdToPenRate: number;
  thresholdPct: number;
  showDebts: boolean;
};

export function DebtPreferences({
  usdToPenRate,
  thresholdPct,
  showDebts,
}: DebtPreferencesProps) {
  const [state, formAction, pending] = useActionState(
    updateDebtPreferencesAction,
    initialState,
  );
  const [show, setShow] = useState(showDebts);

  useEffect(() => {
    if (state.ok) toast.success("Preferencias de deuda actualizadas");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="settings-usd-rate">Tasa USD → PEN</Label>
          <Input
            id="settings-usd-rate"
            name="usdToPenRate"
            type="text"
            inputMode="decimal"
            defaultValue={usdToPenRate}
            required
            className="h-11 tabular-nums"
          />
          <p className="text-[0.6875rem] text-muted-foreground">
            PEN por 1 USD. Se usa para el total de deudas y alertas.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-debt-threshold">
            Alerta de deuda (% del capital)
          </Label>
          <Input
            id="settings-debt-threshold"
            name="debtAlertThresholdPct"
            type="text"
            inputMode="decimal"
            defaultValue={thresholdPct}
            required
            className="h-11 tabular-nums"
          />
          <p className="text-[0.6875rem] text-muted-foreground">
            Aviso neutral cuando la deuda supera este porcentaje del capital
            propio.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <Label htmlFor="settings-show-debts" className="text-sm">
            Mostrar sección de deudas
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Oculta el acceso y las tarjetas de deuda del dashboard.
          </p>
        </div>
        <Switch
          id="settings-show-debts"
          checked={show}
          onCheckedChange={setShow}
          className="mt-0.5"
        />
        <input
          type="hidden"
          name="showDebts"
          value={show ? "true" : "false"}
        />
      </div>

      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending}>
        {pending ? "Guardando…" : "Guardar preferencias"}
      </Button>
    </form>
  );
}
