"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
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
import {
  Sheet,
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

const initialState: DebtActionState = {};
const QUICK_AMOUNTS = [50, 100, 500, 1000] as const;

type NewDebtSheetProps = {
  bankrolls: { id: string; name: string; currency: string }[];
  defaultCurrency: DebtCurrencyCode;
  today: string;
  usdToPenRate: number;
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
  const [interestRate, setInterestRate] = useState("");
  const [notes, setNotes] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const selectedBankroll = bankrolls.find((item) => item.id === bankrollId);
  const needsRate = Boolean(
    selectedBankroll && currency !== selectedBankroll.currency,
  );
  const currencyInfo = DEBT_CURRENCY_LABELS[currency];

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
    setExchangeRate(
      suggestedRate(next, selectedBankroll?.currency ?? "PEN", usdToPenRate),
    );
  };

  const selectBankroll = (next: string) => {
    setBankrollId(next);
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
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-2xl pb-0 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-3 pr-10">
          <SheetTitle>Nueva deuda</SheetTitle>
          <SheetDescription>
            Registra el préstamo, su moneda y si entra al bankroll.
          </SheetDescription>
        </SheetHeader>

        <form
          action={formAction}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
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
                        "flex h-11 items-center justify-center gap-1 rounded-md text-sm font-medium transition-colors",
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
              <div className="flex flex-wrap gap-1.5">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="debt-borrowed-at">Fecha</Label>
                <Input
                  id="debt-borrowed-at"
                  name="borrowedAt"
                  type="date"
                  value={borrowedAt}
                  onChange={(event) => setBorrowedAt(event.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="debt-due-date">Vencimiento</Label>
                <Input
                  id="debt-due-date"
                  name="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="h-11"
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
                <Input
                  id="debt-rate"
                  name="exchangeRate"
                  type="text"
                  inputMode="decimal"
                  value={exchangeRate}
                  onChange={(event) => setExchangeRate(event.target.value)}
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
                  Última tasa usada como sugerencia. Puedes cambiarla.
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

          <div className="shrink-0 border-t bg-popover/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
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
