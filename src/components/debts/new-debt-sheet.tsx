"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { DateTimeCompact } from "@/components/bets/date-time-field";
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  createDebt,
  type DebtActionState,
} from "@/lib/actions/debt";
import {
  DEBT_CURRENCY_LABELS,
  type DebtCurrencyCode,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatDate, formatOdds } from "@/lib/format";

const initialState: DebtActionState = {};
const QUICK_AMOUNTS = [50, 100, 500, 1000] as const;

export type ExchangeRateOption = {
  id: string;
  label: string;
  buyRate: number;
  sellRate: number;
  effectiveAt: Date;
};

type NewDebtSheetProps = {
  bankrolls: { id: string; name: string; currency: string }[];
  defaultCurrency: DebtCurrencyCode;
  today: string;
  usdToPenRate: number;
  rates: ExchangeRateOption[];
  trigger?: React.ReactNode;
};

function suggestedRate(
  debtCurrency: DebtCurrencyCode,
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

export function NewDebtSheet({
  bankrolls,
  defaultCurrency,
  today,
  usdToPenRate,
  rates,
  trigger,
}: NewDebtSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createDebt, initialState);

  const [currency, setCurrency] = useState<DebtCurrencyCode>(defaultCurrency);
  const [bankrollId, setBankrollId] = useState(bankrolls[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [lenderName, setLenderName] = useState("");
  const [borrowedAt, setBorrowedAt] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [addToBankroll, setAddToBankroll] = useState(true);
  const [exchangeRate, setExchangeRate] = useState(() =>
    suggestedRate(
      defaultCurrency,
      bankrolls[0]?.currency ?? "PEN",
      usdToPenRate,
    ),
  );
  const [rateId, setRateId] = useState("");
  const [rateKind, setRateKind] = useState<"BUY" | "SELL">("BUY");
  const [interestRate, setInterestRate] = useState("");
  const [notes, setNotes] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const selectedBankroll = bankrolls.find((item) => item.id === bankrollId);
  const needsRate = Boolean(
    selectedBankroll && currency !== selectedBankroll.currency,
  );
  const canUseSavedRate =
    needsRate &&
    currency === "USD" &&
    selectedBankroll?.currency === "PEN" &&
    rates.length > 0;
  const savedRate = rates.find((item) => item.id === rateId) ?? null;
  const currencyInfo = DEBT_CURRENCY_LABELS[currency];

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

  useEffect(() => {
    if (!state.ok) {
      if (state.error) toast.error(state.error);
      return;
    }
    toast.success("Deuda registrada");

    const timer = setTimeout(() => {
      setOpen(false);
      setAmount("");
      setLenderName("");
      setDueDate("");
      setInterestRate("");
      setNotes("");
      router.refresh();
    }, 0);

    return () => clearTimeout(timer);
  }, [state, router]);

  const selectCurrency = (next: DebtCurrencyCode) => {
    setCurrency(next);
    setRateId("");
    setExchangeRate(
      suggestedRate(next, selectedBankroll?.currency ?? "PEN", usdToPenRate),
    );
  };

  const selectBankroll = (next: string) => {
    setBankrollId(next);
    setRateId("");
    const bankroll = bankrolls.find((item) => item.id === next);
    setExchangeRate(
      suggestedRate(currency, bankroll?.currency ?? "PEN", usdToPenRate),
    );
  };

  const quickAmounts = useMemo(() => QUICK_AMOUNTS, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button type="button" className="h-11 gap-2">
            <Plus className="size-4" aria-hidden />
            Nueva deuda
          </Button>
        )}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none pb-0 sm:mx-auto sm:h-auto sm:max-h-[92dvh] sm:max-w-xl sm:rounded-t-2xl"
      >
        <SheetHeader className="px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:pb-3 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <SheetTitle>Nueva deuda</SheetTitle>
              <SheetDescription className="text-xs leading-snug sm:text-sm">
                Registra el préstamo, su moneda y si entra al bankroll.
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Cerrar"
                className="-mr-1 -mt-1 shrink-0"
              >
                <X className="size-5" aria-hidden />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        <form
          action={formAction}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-4 sm:space-y-4">
            {state.error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {state.error}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="debt-lender">Acreedor</Label>
              <Input
                id="debt-lender"
                name="lenderName"
                value={lenderName}
                onChange={(event) => setLenderName(event.target.value)}
                placeholder="Ej. Banco, familiar, casa de apuestas"
                maxLength={120}
                required
                className="h-11"
                aria-invalid={Boolean(state.fieldErrors?.lenderName)}
              />
              {state.fieldErrors?.lenderName?.[0] && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.lenderName[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="debt-principal">Monto prestado</Label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
                {(["PEN", "USD"] as const).map((code) => {
                  const active = currency === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={active}
                      onClick={() => selectCurrency(code)}
                      className={cn(
                        "flex h-11 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-[13px] font-medium transition-colors sm:text-sm",
                        active
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground active:bg-background/60",
                      )}
                    >
                      {DEBT_CURRENCY_LABELS[code].symbol}{" "}
                      {DEBT_CURRENCY_LABELS[code].label}
                    </button>
                  );
                })}
              </div>
              <input type="hidden" name="currency" value={currency} />
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currencyInfo.symbol}
                </span>
                <Input
                  id="debt-principal"
                  name="principal"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  required
                  className="h-12 pl-10 text-lg font-semibold tabular-nums"
                  aria-invalid={Boolean(state.fieldErrors?.principal)}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-4">
                {quickAmounts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAmount(String(value))}
                    className={cn(
                      "h-11 rounded-lg border px-3 text-xs font-medium tabular-nums transition-colors",
                      amount === String(value)
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-background text-muted-foreground active:bg-muted",
                    )}
                  >
                    {currencyInfo.symbol} {value}
                  </button>
                ))}
              </div>
              {state.fieldErrors?.principal?.[0] && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.principal[0]}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="debt-borrowed-at">Fecha</Label>
                <input type="hidden" name="borrowedAt" value={borrowedAt} />
                <DateTimeCompact
                  id="debt-borrowed-at"
                  mode="date"
                  size="default"
                  value={borrowedAt}
                  onChange={setBorrowedAt}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="debt-due-date">Vencimiento</Label>
                <input type="hidden" name="dueDate" value={dueDate} />
                <DateTimeCompact
                  id="debt-due-date"
                  mode="date"
                  size="default"
                  value={dueDate}
                  onChange={setDueDate}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="debt-bankroll">Bankroll destino</Label>
              <Select value={bankrollId} onValueChange={selectBankroll}>
                <SelectTrigger id="debt-bankroll" className="h-11 w-full">
                  <SelectValue placeholder="Elige un bankroll" />
                </SelectTrigger>
                <SelectContent>
                  {bankrolls.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="bankrollId" value={bankrollId} />
              {state.fieldErrors?.bankrollId?.[0] && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.bankrollId[0]}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Label htmlFor="debt-add" className="text-sm">
                  Agregar al bankroll
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Suma el préstamo convertido al saldo disponible.
                </p>
              </div>
              <Switch
                id="debt-add"
                checked={addToBankroll}
                onCheckedChange={setAddToBankroll}
                className="mt-0.5"
              />
              <input
                type="hidden"
                name="addToBankroll"
                value={addToBankroll ? "true" : "false"}
              />
            </div>

            {needsRate && (
              <div className="space-y-1.5">
                <Label htmlFor="debt-rate">
                  Tasa de cambio ({selectedBankroll?.currency} por 1{" "}
                  {currency})
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
                  id="debt-rate"
                  name="exchangeRate"
                  type="text"
                  inputMode="decimal"
                  value={exchangeRate}
                  onChange={(event) => {
                    setRateId("");
                    setExchangeRate(event.target.value);
                  }}
                  placeholder={
                    currency === "USD"
                      ? String(usdToPenRate)
                      : String(1 / usdToPenRate)
                  }
                  required
                  className="h-11 tabular-nums"
                  aria-invalid={Boolean(state.fieldErrors?.exchangeRate)}
                />
                <p className="text-[11px] text-muted-foreground">
                  {canUseSavedRate
                    ? "Elige una tasa guardada o edita la cifra para usar una manual."
                    : "Última tasa usada como sugerencia. Puedes cambiarla."}
                </p>
                {state.fieldErrors?.exchangeRate?.[0] && (
                  <p className="text-xs text-destructive">
                    {state.fieldErrors.exchangeRate[0]}
                  </p>
                )}
              </div>
            )}

            <details
              className="rounded-lg border p-3"
              open={detailsOpen}
              onToggle={(event) =>
                setDetailsOpen((event.target as HTMLDetailsElement).open)
              }
            >
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Interés y notas (opcional)
              </summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="debt-interest">
                    Interés mensual (%)
                  </Label>
                  <Input
                    id="debt-interest"
                    name="interestRateMonthly"
                    type="text"
                    inputMode="decimal"
                    value={interestRate}
                    onChange={(event) => setInterestRate(event.target.value)}
                    placeholder="0"
                    className="h-11 tabular-nums"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Interés simple prorrateado por días. Déjalo vacío si no
                    genera interés.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="debt-notes">Notas</Label>
                  <textarea
                    id="debt-notes"
                    name="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={500}
                    rows={2}
                    className="flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
              </div>
            </details>
          </div>

          <div className="shrink-0 border-t bg-popover/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur">
            <Button
              type="submit"
              className="h-12 w-full gap-2"
              disabled={pending || bankrolls.length === 0}
            >
              <Sparkles className="size-4" aria-hidden />
              {pending ? "Guardando…" : "Crear deuda"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

