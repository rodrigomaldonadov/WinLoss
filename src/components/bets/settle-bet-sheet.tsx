"use client";

import { useActionState, useEffect, useState } from "react";
import { CircleAlert, Gavel } from "lucide-react";
import type { BetStatus } from "@prisma/client";
import { toast } from "sonner";

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
import { settleBet, type SettleBetState } from "@/lib/actions/bet";
import { calculateBetResult } from "@/lib/bet-math";
import { BET_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const initialState: SettleBetState = {};

const SETTLE_OPTIONS: Exclude<BetStatus, "PENDING">[] = [
  "WON",
  "LOST",
  "VOID",
  "HALF_WON",
  "HALF_LOST",
  "CASHOUT",
];

type SettleBetSheetProps = {
  bet: {
    id: string;
    eventName: string;
    stake: number;
    odds: number;
    isFreeBet: boolean;
    bankroll: { currency: string };
  };
};

export function SettleBetSheet({ bet }: SettleBetSheetProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Exclude<BetStatus, "PENDING">>("WON");
  const [cashout, setCashout] = useState("");
  const [closingOdds, setClosingOdds] = useState("");
  const [state, formAction, pending] = useActionState(
    settleBet,
    initialState,
  );

  useEffect(() => {
    if (state.ok) toast.success("Apuesta liquidada");
    if (state.error) toast.error(state.error);
  }, [state]);

  // Tras una liquidación correcta revalidamos y cerramos el panel.
  const sheetOpen = open && !state.ok;

  const cashoutValue = Number(cashout.replace(",", "."));
  const preview = calculateBetResult({
    stake: bet.stake,
    odds: bet.odds,
    status,
    isFreeBet: bet.isFreeBet,
    cashoutAmount:
      status === "CASHOUT" && Number.isFinite(cashoutValue)
        ? cashoutValue
        : undefined,
  });
  const previewProfit = preview.profit.toNumber();
  const canPreview =
    status !== "CASHOUT" || (Number.isFinite(cashoutValue) && cashoutValue > 0);

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setStatus("WON");
      }}
    >
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-10">
          <Gavel className="size-4" aria-hidden />
          Liquidar
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-6 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Liquidar apuesta</SheetTitle>
          <SheetDescription className="line-clamp-2">
            {bet.eventName}
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="space-y-4 px-4">
          <input type="hidden" name="id" value={bet.id} />
          <input type="hidden" name="status" value={status} />

          {state.error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{state.error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {SETTLE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatus(option)}
                aria-pressed={status === option}
                className={cn(
                  "flex h-11 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors",
                  status === option
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground active:bg-muted",
                )}
              >
                {BET_STATUS_LABELS[option]}
              </button>
            ))}
          </div>

          {status === "CASHOUT" && (
            <div className="space-y-1.5">
              <Label htmlFor="settle-cashout">Importe del cashout</Label>
              <Input
                id="settle-cashout"
                name="cashoutAmount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={cashout}
                onChange={(event) => setCashout(event.target.value)}
                required
                className="h-12 tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Total devuelto por la casa, no el beneficio.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="settle-closing-odds">Cuota de cierre</Label>
            <Input
              id="settle-closing-odds"
              name="closingOdds"
              type="text"
              inputMode="decimal"
              placeholder="1.85"
              value={closingOdds}
              onChange={(event) => setClosingOdds(event.target.value)}
              required
              className="h-12 tabular-nums"
            />
            <p className="text-xs text-muted-foreground">
              Cuota a la que cerró la línea cuando saliste del mercado. Se usa
              para calcular el CLV del trade.
            </p>
          </div>

          {canPreview && (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Beneficio resultante</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  previewProfit > 0
                    ? "text-success"
                    : previewProfit < 0
                      ? "text-loss"
                      : "text-muted-foreground",
                )}
              >
                {formatSignedCurrency(previewProfit, bet.bankroll.currency)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-xs text-muted-foreground">
            <span>
              Stake {formatCurrency(bet.stake, bet.bankroll.currency)} · Cuota{" "}
              {bet.odds.toFixed(2)}
            </span>
            {bet.isFreeBet && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                Free bet
              </span>
            )}
          </div>

          <Button
            type="submit"
            className="h-12 w-full"
            disabled={pending || !canPreview}
          >
            {pending ? "Guardando…" : "Confirmar resultado"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
