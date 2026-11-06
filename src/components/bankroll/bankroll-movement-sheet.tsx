"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
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
import {
  createBankrollMovement,
  type DebtActionState,
} from "@/lib/actions/debt";
import {
  DEBT_CURRENCY_LABELS,
  type DebtCurrencyCode,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const initialState: DebtActionState = {};

type BankrollMovementSheetProps = {
  bankrolls: { id: string; name: string; currency: string }[];
  today: string;
  usdToPenRate: number;
  trigger?: React.ReactNode;
};

function suggestedRate(
  amountCurrency: DebtCurrencyCode,
  bankrollCurrency: string,
  usdToPenRate: number,
): string {
  if (amountCurrency === bankrollCurrency) return "";
  if (amountCurrency === "USD" && bankrollCurrency === "PEN") {
    return String(usdToPenRate);
  }
  if (amountCurrency === "PEN" && bankrollCurrency === "USD") {
    return String(Math.round((1 / usdToPenRate) * 1_000_000) / 1_000_000);
  }
  return "";
}

export function BankrollMovementSheet({
  bankrolls,
  today,
  usdToPenRate,
  trigger,
}: BankrollMovementSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createBankrollMovement,
    initialState,
  );

  const firstBankroll = bankrolls[0];
  const [bankrollId, setBankrollId] = useState(firstBankroll?.id ?? "");
  const [type, setType] = useState<"DEPOSIT" | "WITHDRAWAL">("DEPOSIT");
  const [currency, setCurrency] = useState<DebtCurrencyCode>(
    firstBankroll?.currency === "USD" ? "USD" : "PEN",
  );
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(today);
  const [exchangeRate, setExchangeRate] = useState(() =>
    suggestedRate(
      firstBankroll?.currency === "USD" ? "USD" : "PEN",
      firstBankroll?.currency ?? "PEN",
      usdToPenRate,
    ),
  );
  const [note, setNote] = useState("");

  const selectedBankroll = bankrolls.find((item) => item.id === bankrollId);
  const needsRate = Boolean(
    selectedBankroll && currency !== selectedBankroll.currency,
  );

  useEffect(() => {
    if (!state.ok) {
      if (state.error) toast.error(state.error);
      return;
    }
    toast.success(type === "DEPOSIT" ? "Depósito registrado" : "Retiro registrado");

    const timer = setTimeout(() => {
      setOpen(false);
      setAmount("");
      setNote("");
      router.refresh();
    }, 0);

    return () => clearTimeout(timer);
  }, [state, router, type]);

  const selectBankroll = (next: string) => {
    setBankrollId(next);
    const bankroll = bankrolls.find((item) => item.id === next);
    setExchangeRate(
      suggestedRate(currency, bankroll?.currency ?? "PEN", usdToPenRate),
    );
  };

  const selectCurrency = (next: DebtCurrencyCode) => {
    setCurrency(next);
    setExchangeRate(
      suggestedRate(next, selectedBankroll?.currency ?? "PEN", usdToPenRate),
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" className="h-11">
            Movimiento
          </Button>
        )}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-2xl pb-0 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-3 pr-10">
          <SheetTitle>Movimiento manual</SheetTitle>
          <SheetDescription>
            Registra un depósito o retiro que no sea una apuesta.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            {state.error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {state.error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
              {[
                {
                  value: "DEPOSIT" as const,
                  label: "Depósito",
                  icon: ArrowDownToLine,
                },
                {
                  value: "WITHDRAWAL" as const,
                  label: "Retiro",
                  icon: ArrowUpFromLine,
                },
              ].map((option) => {
                const active = type === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setType(option.value)}
                    className={cn(
                      "flex h-11 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors",
                      active
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground active:bg-background/60",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="type" value={type} />

            <div className="space-y-1.5">
              <Label htmlFor="movement-bankroll">Bankroll</Label>
              <Select value={bankrollId} onValueChange={selectBankroll}>
                <SelectTrigger id="movement-bankroll" className="h-11 w-full">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="movement-amount">Monto</Label>
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
                        "flex h-11 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors",
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
                  {DEBT_CURRENCY_LABELS[currency].symbol}
                </span>
                <Input
                  id="movement-amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  required
                  className="h-12 pl-10 text-lg font-semibold tabular-nums"
                  aria-invalid={Boolean(state.fieldErrors?.amount)}
                />
              </div>
              {state.fieldErrors?.amount?.[0] && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.amount[0]}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="movement-date">Fecha</Label>
              <Input
                id="movement-date"
                name="occurredAt"
                type="date"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
                required
                className="h-11"
              />
            </div>

            {needsRate && (
              <div className="space-y-1.5">
                <Label htmlFor="movement-rate">
                  Tasa ({selectedBankroll?.currency} por 1 {currency})
                </Label>
                <Input
                  id="movement-rate"
                  name="exchangeRate"
                  type="text"
                  inputMode="decimal"
                  value={exchangeRate}
                  onChange={(event) => setExchangeRate(event.target.value)}
                  required
                  className="h-11 tabular-nums"
                  aria-invalid={Boolean(state.fieldErrors?.exchangeRate)}
                />
                {state.fieldErrors?.exchangeRate?.[0] && (
                  <p className="text-xs text-destructive">
                    {state.fieldErrors.exchangeRate[0]}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="movement-note">Nota (opcional)</Label>
              <Input
                id="movement-note"
                name="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                placeholder="Transferencia, efectivo…"
                className="h-11"
              />
            </div>
          </div>

          <div className="shrink-0 border-t bg-popover/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <Button
              type="submit"
              className="h-12 w-full"
              disabled={pending || bankrolls.length === 0}
            >
              {pending ? "Guardando…" : "Registrar movimiento"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
