"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteExchangeRate,
  saveExchangeRate,
  type ExchangeRateActionState,
} from "@/lib/actions/exchange-rates";
import type { ExchangeRateItem } from "@/lib/data/exchange-rates";
import { formatDate, formatOdds } from "@/lib/format";

const initialState: ExchangeRateActionState = {};

export function ExchangeRatesCard({
  rates,
  today,
}: {
  rates: ExchangeRateItem[];
  today: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    saveExchangeRate,
    initialState,
  );
  const [label, setLabel] = useState("");
  const [buyRate, setBuyRate] = useState("");
  const [sellRate, setSellRate] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(today);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!state.ok) {
      if (state.error) toast.error(state.error);
      return;
    }
    toast.success("Tasa registrada");
    const timer = setTimeout(() => {
      setLabel("");
      setBuyRate("");
      setSellRate("");
      setNote("");
      router.refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [state, router]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Tasas de cambio USD → PEN</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Registra el precio de compra y de venta por banco o casa de cambio. Al
          crear o pagar una deuda en dólares eliges la entrada y el lado que
          aplicaste. Las deudas conservan la tasa con la que se registraron.
        </p>
      </div>

      <form action={formAction} className="space-y-2 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="rate-label">Banco o casa</Label>
          <Input
            id="rate-label"
            name="label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ej. BCP, Interbank, casa de cambio"
            maxLength={60}
            required
            className="h-11"
            aria-invalid={Boolean(state.fieldErrors?.label)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="rate-buy">Compra</Label>
            <Input
              id="rate-buy"
              name="buyRate"
              type="text"
              inputMode="decimal"
              value={buyRate}
              onChange={(event) => setBuyRate(event.target.value)}
              placeholder="3.70"
              required
              className="h-11 tabular-nums"
              aria-invalid={Boolean(state.fieldErrors?.buyRate)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate-sell">Venta</Label>
            <Input
              id="rate-sell"
              name="sellRate"
              type="text"
              inputMode="decimal"
              value={sellRate}
              onChange={(event) => setSellRate(event.target.value)}
              placeholder="3.78"
              required
              className="h-11 tabular-nums"
              aria-invalid={Boolean(state.fieldErrors?.sellRate)}
            />
          </div>
        </div>
        {(state.fieldErrors?.buyRate?.[0] || state.fieldErrors?.sellRate?.[0]) && (
          <p className="text-xs text-destructive">
            {state.fieldErrors.buyRate?.[0] ?? state.fieldErrors.sellRate?.[0]}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="rate-date">Fecha</Label>
            <Input
              id="rate-date"
              name="effectiveAt"
              type="date"
              value={effectiveAt}
              onChange={(event) => setEffectiveAt(event.target.value)}
              required
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate-note">Nota (opcional)</Label>
            <Input
              id="rate-note"
              name="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder="Ventanilla, app…"
              className="h-11"
            />
          </div>
        </div>

        <Button type="submit" className="h-11 w-full gap-1.5" disabled={pending}>
          <Plus className="size-4" aria-hidden />
          {pending ? "Guardando…" : "Registrar tasa"}
        </Button>
      </form>

      {rates.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
          Sin tasas registradas. Mientras no haya, las deudas usan la tasa manual
          de la sección de deudas.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rates.map((rate) => (
            <li
              key={rate.id}
              className="flex items-start justify-between gap-2 rounded-lg border bg-card px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{rate.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDate(rate.effectiveAt, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  {" · "}
                  Compra{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatOdds(rate.buyRate)}
                  </span>
                  {" · "}
                  Venta{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatOdds(rate.sellRate)}
                  </span>
                </p>
                {rate.note && (
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {rate.note}
                  </p>
                )}
              </div>
              <form action={deleteExchangeRate}>
                <input type="hidden" name="id" value={rate.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={`Eliminar tasa de ${rate.label}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
