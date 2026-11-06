"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Gavel } from "lucide-react";
import type { BetStatus, LegStatus } from "@prisma/client";
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
import { calculateBetResult, settleBet as settleBetMath } from "@/lib/bet-math";
import { BET_STATUS_LABELS } from "@/lib/constants";
import {
  formatCurrency,
  formatOdds,
  formatSignedCurrency,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const initialState: SettleBetState = {};

const LEG_OPTIONS: LegStatus[] = [
  "WON",
  "LOST",
  "VOID",
  "HALF_WON",
  "HALF_LOST",
];

type SettleLeg = {
  id: string;
  eventName: string;
  odds: number;
  status: LegStatus;
  selections: { market: string; selection: string }[];
};

type SettleBetSheetProps = {
  bet: {
    id: string;
    eventName: string;
    stake: number;
    odds: number;
    isFreeBet: boolean;
    oddsBoostPct?: number | null;
    bankroll: { currency: string };
    legs: SettleLeg[];
  };
  debtSuggestion?: {
    id: string;
    lenderName: string;
  } | null;
};

function initialStatuses(legs: SettleLeg[]): Record<string, LegStatus> {
  return Object.fromEntries(legs.map((leg) => [leg.id, "WON" as LegStatus]));
}

export function SettleBetSheet({ bet, debtSuggestion }: SettleBetSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, LegStatus>>(() =>
    initialStatuses(bet.legs),
  );
  const [closingOdds, setClosingOdds] = useState<Record<string, string>>({});
  const [cashout, setCashout] = useState("");
  const [state, formAction, pending] = useActionState(
    settleBet,
    initialState,
  );

  // Tras una liquidación correcta revalidamos y cerramos el panel.
  const sheetOpen = open && !state.ok;

  const cashoutValue = Number(cashout.replace(",", "."));
  const hasCashout = Number.isFinite(cashoutValue) && cashoutValue > 0;

  const previewMath = hasCashout
    ? null
    : settleBetMath(
        bet.legs.map((leg) => ({
          odds: leg.odds,
          status: statuses[leg.id] ?? "PENDING",
        })),
        bet.stake,
        bet.isFreeBet,
        bet.oddsBoostPct ?? 0,
      );

  const preview = hasCashout
    ? calculateBetResult({
        stake: bet.stake,
        odds: bet.odds,
        status: "CASHOUT",
        isFreeBet: bet.isFreeBet,
        cashoutAmount: cashoutValue,
      })
    : previewMath!;

  const previewStatus: BetStatus = hasCashout ? "CASHOUT" : previewMath!.status;
  const previewProfit = preview.profit.toNumber();
  const canSubmit = hasCashout || previewStatus !== "PENDING";

  useEffect(() => {
    if (state.ok) {
      toast.success("Apuesta liquidada");
      if (
        debtSuggestion &&
        previewProfit > 0 &&
        (previewStatus === "WON" || previewStatus === "HALF_WON")
      ) {
        toast.info(
          `Ganaste ${formatCurrency(previewProfit, bet.bankroll.currency)}. ¿Abonar a ${debtSuggestion.lenderName}?`,
          {
            duration: 8000,
            action: {
              label: "Abonar",
              onClick: () => {
                router.push(`/debts/${debtSuggestion.id}?pagar=1`);
              },
            },
          },
        );
      }
    }
    if (state.error) toast.error(state.error);
  }, [
    state,
    debtSuggestion,
    previewProfit,
    previewStatus,
    bet.bankroll.currency,
    router,
  ]);

  const setAllStatuses = (status: LegStatus) => {
    setStatuses(Object.fromEntries(bet.legs.map((leg) => [leg.id, status])));
  };

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setStatuses(initialStatuses(bet.legs));
          setClosingOdds({});
          setCashout("");
        }
      }}
    >
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-11">
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
            {bet.legs.length > 1 ? ` · ${bet.legs.length} partidos` : ""}
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="space-y-4 px-4">
          <input type="hidden" name="id" value={bet.id} />

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
            <Button
              type="button"
              variant="outline"
              className="h-9 text-xs"
              onClick={() => setAllStatuses("WON")}
            >
              Todo ganado
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 text-xs"
              onClick={() => setAllStatuses("LOST")}
            >
              Todo perdido
            </Button>
          </div>

          <div className="space-y-3">
            {bet.legs.map((leg, index) => {
              const status = statuses[leg.id] ?? "PENDING";
              return (
                <div
                  key={leg.id}
                  className="space-y-2 rounded-lg border bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {leg.eventName}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {leg.selections
                        .map(
                          (selection) =>
                            `${selection.market}: ${selection.selection}`,
                        )
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                      Cuota {formatOdds(leg.odds)}
                    </p>
                  </div>

                  <input
                    type="hidden"
                    name={`legs.${index}.id`}
                    value={leg.id}
                  />
                  <input
                    type="hidden"
                    name={`legs.${index}.status`}
                    value={status}
                  />

                  <div className="grid grid-cols-3 gap-1.5">
                    {LEG_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setStatuses((current) => ({
                            ...current,
                            [leg.id]: option,
                          }))
                        }
                        aria-pressed={status === option}
                        className={cn(
                          "flex h-9 items-center justify-center rounded-md border px-1 text-[11px] font-medium transition-colors",
                          status === option
                            ? "border-primary bg-primary/10 text-primary"
                            : "bg-background text-muted-foreground active:bg-muted",
                        )}
                      >
                        {BET_STATUS_LABELS[option]}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor={`settle-closing-${index}`}
                      className="text-[11px] text-muted-foreground"
                    >
                      Cuota de cierre (opcional)
                    </Label>
                    <Input
                      id={`settle-closing-${index}`}
                      name={`legs.${index}.closingOdds`}
                      type="text"
                      inputMode="decimal"
                      placeholder="1.85"
                      value={closingOdds[leg.id] ?? ""}
                      onChange={(event) =>
                        setClosingOdds((current) => ({
                          ...current,
                          [leg.id]: event.target.value,
                        }))
                      }
                      className="h-9 tabular-nums"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settle-cashout">
              Cashout{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </Label>
            <Input
              id="settle-cashout"
              name="cashoutAmount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={cashout}
              onChange={(event) => setCashout(event.target.value)}
              className="h-11 tabular-nums"
            />
            <p className="text-xs text-muted-foreground">
              Total devuelto por la casa, no el beneficio. Si lo indicas, el
              boleto se liquida como cashout.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">Estado resultante</span>
            <span className="font-semibold">
              {BET_STATUS_LABELS[previewStatus]}
            </span>
          </div>

          {canSubmit && (
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
              {formatOdds(bet.odds)}
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
            disabled={pending || !canSubmit}
          >
            {pending ? "Guardando…" : "Confirmar resultado"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
