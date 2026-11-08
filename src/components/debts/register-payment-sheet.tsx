"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExchangeRateOption } from "@/components/debts/new-debt-sheet";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  registerPayment,
  voidPayment,
  type DebtActionState,
} from "@/lib/actions/debt";
import { DEBT_CURRENCY_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate, formatOdds } from "@/lib/format";
import { cn } from "@/lib/utils";

const initialState: DebtActionState = {};

type DebtPaymentSheetProps = {
  debt: {
    id: string;
    lenderName: string;
    balance: number;
    currency: "PEN" | "USD";
    bankrollCurrency: string;
    bankrollName: string;
    freeBankrollBalance: number;
    availableProfit: number;
  };
  usdToPenRate: number;
  today: string;
  rates: ExchangeRateOption[];
  defaultOpen?: boolean;
  trigger?: React.ReactNode;
};

function suggestedRate(
  debtCurrency: "PEN" | "USD",
  bankrollCurrency: string,
  usdToPenRate: number,
): string {
  if (debtCurrency === bankrollCurrency) return "";
  if (debtCurrency === "USD" && bankrollCurrency === "PEN") {
    return String(usdToPenRate);
  }
  if (debtCurrency === "PEN" && bankrollCurrency === "USD") {
    return String(Math.round((1 / usdToPenRate) * 1_000_000) / 1_000_000);
  }
  return "";
}

export function RegisterPaymentSheet({
  debt,
  usdToPenRate,
  today,
  rates,
  defaultOpen = false,
  trigger,
}: DebtPaymentSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction, pending] = useActionState(
    registerPayment,
    initialState,
  );

  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [source, setSource] = useState<"FROM_BANKROLL" | "EXTERNAL">(
    "FROM_BANKROLL",
  );
  const [exchangeRate, setExchangeRate] = useState(() =>
    suggestedRate(debt.currency, debt.bankrollCurrency, usdToPenRate),
  );
  const [rateId, setRateId] = useState("");
  const [rateKind, setRateKind] = useState<"BUY" | "SELL">("SELL");
  const [note, setNote] = useState("");

  const needsRate = debt.currency !== debt.bankrollCurrency;
  const canUseSavedRate =
    needsRate &&
    debt.currency === "USD" &&
    debt.bankrollCurrency === "PEN" &&
    rates.length > 0;
  const savedRate = rates.find((item) => item.id === rateId) ?? null;
  const savedValue = (entry: ExchangeRateOption, kind: "BUY" | "SELL") =>
    kind === "BUY" ? entry.buyRate : entry.sellRate;

  const selectSavedRate = (id: string) => {
    if (id === "manual") {
      setRateId("");
      return;
    }
    const entry = rates.find((item) => item.id === id);
    if (!entry) return;
    setRateId(id);
    setExchangeRate(String(savedValue(entry, rateKind)));
  };

  const selectRateKind = (kind: "BUY" | "SELL") => {
    setRateKind(kind);
    if (savedRate) setExchangeRate(String(savedValue(savedRate, kind)));
  };
  const currencyInfo = DEBT_CURRENCY_LABELS[debt.currency];
  const rateValue = Number(exchangeRate.replace(",", "."));
  const effectiveRate =
    !needsRate ? 1 : Number.isFinite(rateValue) && rateValue > 0 ? rateValue : 0;
  const amountValue = Number(amount.replace(",", "."));
  const validAmount = Number.isFinite(amountValue) && amountValue > 0;
  const converted =
    source === "FROM_BANKROLL" && validAmount
      ? Math.round(amountValue * effectiveRate * 100) / 100
      : 0;
  const amountExceeds = validAmount && amountValue > debt.balance + 0.0001;
  const bankrollExceeds =
    source === "FROM_BANKROLL" &&
    converted > debt.freeBankrollBalance + 0.0001;
  const availableInDebtCurrency =
    effectiveRate > 0
      ? Math.floor((debt.availableProfit / effectiveRate) * 100) / 100
      : 0;
  const remainingAfter = Math.max(0, debt.balance - (validAmount ? amountValue : 0));
  const bankrollAfter =
    source === "FROM_BANKROLL"
      ? debt.freeBankrollBalance - converted
      : debt.freeBankrollBalance;

  useEffect(() => {
    if (!state.ok) {
      if (state.error) toast.error(state.error);
      return;
    }

    const paymentId = state.paymentId;
    toast.success("Pago registrado", {
      duration: 8000,
      action: paymentId
        ? {
            label: "Deshacer",
            onClick: () => {
              void voidPayment(paymentId).then((result) => {
                if (result.ok) {
                  toast.success("Pago anulado");
                  router.refresh();
                } else {
                  toast.error(result.error ?? "No pudimos anular el pago.");
                }
              });
            },
          }
        : undefined,
    });

    const timer = setTimeout(() => {
      setOpen(false);
      setAmount("");
      setNote("");
      router.refresh();
    }, 0);

    return () => clearTimeout(timer);
  }, [state, router]);

  const canSubmit =
    validAmount &&
    !amountExceeds &&
    !bankrollExceeds &&
    !pending &&
    (!needsRate || source === "EXTERNAL" || effectiveRate > 0);

  const setAmountFromChip = (value: number) => {
    setAmount(String(Math.max(0, Math.round(value * 100) / 100)));
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button type="button" className="h-11 gap-2">
            <Wallet className="size-4" aria-hidden />
            Registrar pago
          </Button>
        )}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-x-hidden rounded-none pb-0 sm:mx-auto sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl"
      >
        <SheetHeader className="min-w-0 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:pb-3 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <SheetTitle>Registrar pago</SheetTitle>
              <SheetDescription className="text-xs leading-snug break-words sm:text-sm">
                {debt.lenderName} · saldo{" "}
                {formatCurrency(debt.balance, debt.currency)}
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar"
                className="-mt-1 -mr-1 shrink-0"
              >
                <X className="size-5" aria-hidden />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-4">
            {state.error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {state.error}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="payment-amount">Monto a pagar</Label>
              <div
                className={cn(
                  "flex h-12 w-full items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
                  (amountExceeds || Boolean(state.fieldErrors?.amount)) &&
                    "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
                )}
              >
                <span className="pointer-events-none shrink-0 pl-3 text-sm text-muted-foreground">
                  {currencyInfo.symbol}
                </span>
                <input
                  id="payment-amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  required
                  className="h-full w-full min-w-0 bg-transparent pr-3 pl-2 text-lg font-semibold tabular-nums outline-none placeholder:text-muted-foreground"
                  aria-invalid={
                    amountExceeds || Boolean(state.fieldErrors?.amount)
                  }
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setAmountFromChip(debt.balance)}
                  className="h-11 rounded-lg border bg-background px-3 text-xs font-medium active:bg-muted"
                >
                  Todo
                </button>
                <button
                  type="button"
                  onClick={() => setAmountFromChip(debt.balance / 2)}
                  className="h-11 rounded-lg border bg-background px-3 text-xs font-medium active:bg-muted"
                >
                  50%
                </button>
                <button
                  type="button"
                  disabled={availableInDebtCurrency <= 0}
                  onClick={() =>
                    setAmountFromChip(
                      Math.min(debt.balance, availableInDebtCurrency),
                    )
                  }
                  className="h-11 rounded-lg border bg-background px-3 text-xs font-medium disabled:opacity-40 active:bg-muted"
                >
                  Mis ganancias
                </button>
              </div>

              {amountExceeds && (
                <p className="text-xs text-destructive">
                  El pago supera el saldo pendiente.
                </p>
              )}
              {state.fieldErrors?.amount?.[0] && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.amount[0]}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Ganancias disponibles:{" "}
                {formatCurrency(debt.availableProfit, debt.bankrollCurrency)}
                {needsRate
                  ? ` · ${formatCurrency(availableInDebtCurrency, debt.currency)}`
                  : ""}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-date">Fecha del pago</Label>
              <Input
                id="payment-date"
                name="paidAt"
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>Origen</Label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
                {[
                  { value: "FROM_BANKROLL" as const, label: "Del bankroll" },
                  { value: "EXTERNAL" as const, label: "Pagado aparte" },
                ].map((option) => {
                  const active = source === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSource(option.value)}
                      className={cn(
                        "h-11 rounded-md text-xs font-medium transition-colors",
                        active
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground active:bg-background/60",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <input type="hidden" name="source" value={source} />
            </div>

            {needsRate && source === "FROM_BANKROLL" && (
              <div className="space-y-1.5">
                <Label htmlFor="payment-rate">
                  Tasa ({debt.bankrollCurrency} por 1 {debt.currency})
                </Label>

                {canUseSavedRate && (
                  <div className="space-y-1.5 rounded-lg border bg-muted/20 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium">
                        Tasa guardada
                      </span>
                      <Link
                        href="/settings"
                        className="text-[11px] font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Gestionar
                      </Link>
                    </div>
                    <Select
                      value={rateId || "manual"}
                      onValueChange={selectSavedRate}
                    >
                      <SelectTrigger className="h-11 w-full" aria-label="Tasa guardada">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        {rates.map((rate) => (
                          <SelectItem key={rate.id} value={rate.id}>
                            {rate.label} ·{" "}
                            {formatDate(rate.effectiveAt, {
                              day: "2-digit",
                              month: "short",
                            })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {savedRate && (
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-background p-1">
                        {(["BUY", "SELL"] as const).map((kind) => {
                          const active = rateKind === kind;
                          return (
                            <button
                              key={kind}
                              type="button"
                              aria-pressed={active}
                              onClick={() => selectRateKind(kind)}
                              className={cn(
                                "h-11 min-w-0 rounded-md px-1 text-xs font-medium transition-colors",
                                active
                                  ? "bg-primary/10 text-primary"
                                  : "text-muted-foreground active:bg-muted",
                              )}
                            >
                              {kind === "BUY" ? "Compra" : "Venta"} ·{" "}
                              <span className="tabular-nums">
                                {formatOdds(savedValue(savedRate, kind))}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {rateId && (
                      <>
                        <input type="hidden" name="rateId" value={rateId} />
                        <input
                          type="hidden"
                          name="rateKind"
                          value={rateKind}
                        />
                      </>
                    )}
                  </div>
                )}

                <Input
                  id="payment-rate"
                  name="exchangeRate"
                  type="text"
                  inputMode="decimal"
                  value={exchangeRate}
                  onChange={(event) => {
                    setRateId("");
                    setExchangeRate(event.target.value);
                  }}
                  required
                  className="h-11 tabular-nums"
                  aria-invalid={Boolean(state.fieldErrors?.exchangeRate)}
                />
                <p className="text-[11px] text-muted-foreground">
                  {canUseSavedRate
                    ? "Elige una tasa guardada o edita la cifra para usar una manual."
                    : "Tasa manual. Regístralas en Ajustes para reutilizarlas."}
                </p>
                {state.fieldErrors?.exchangeRate?.[0] && (
                  <p className="text-xs text-destructive">
                    {state.fieldErrors.exchangeRate[0]}
                  </p>
                )}
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-3 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">
                  Saldo de la deuda
                </span>
                <span className="min-w-0 text-right font-semibold break-words tabular-nums">
                  {formatCurrency(debt.balance, debt.currency)} →{" "}
                  {formatCurrency(remainingAfter, debt.currency)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">
                  {source === "FROM_BANKROLL"
                    ? "Bankroll después del pago"
                    : "Bankroll"}
                </span>
                <span
                  className={cn(
                    "min-w-0 text-right font-semibold break-words tabular-nums",
                    bankrollAfter < 0 && "text-destructive",
                  )}
                >
                  {formatCurrency(bankrollAfter, debt.bankrollCurrency)}
                </span>
              </div>
              {source === "FROM_BANKROLL" && converted > 0 && (
                <p className="mt-1 text-[10px] break-words text-muted-foreground">
                  Se descontarán{" "}
                  {formatCurrency(converted, debt.bankrollCurrency)} de{" "}
                  {debt.bankrollName}.
                </p>
              )}
              {bankrollExceeds && (
                <p className="mt-1 text-[11px] text-destructive">
                  El saldo libre del bankroll no alcanza para este pago.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-note">Nota (opcional)</Label>
              <Input
                id="payment-note"
                name="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                placeholder="Transferencia, efectivo…"
                className="h-11"
              />
            </div>

            <input type="hidden" name="debtId" value={debt.id} />
          </div>

          <div className="shrink-0 border-t bg-popover/95 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] backdrop-blur">
            <Button
              type="submit"
              className="h-12 w-full"
              disabled={!canSubmit}
            >
              {pending ? "Registrando…" : "Confirmar pago"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

