"use client";

import { useActionState, useEffect, useRef } from "react";
import { CircleAlert } from "lucide-react";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CURRENCIES } from "@/lib/constants";
import {
  saveBankroll,
  type BankrollFormState,
} from "@/lib/actions/bankroll";
import type { BankrollSummary } from "@/lib/types";

const initialState: BankrollFormState = {};

type BankrollFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankroll?: BankrollSummary;
};

export function BankrollFormSheet({
  open,
  onOpenChange,
  bankroll,
}: BankrollFormSheetProps) {
  const [state, formAction, pending] = useActionState(
    saveBankroll,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const isEditing = Boolean(bankroll);

  useEffect(() => {
    if (!state.ok) return;

    formRef.current?.reset();
    toast.success(isEditing ? "Bankroll actualizado" : "Bankroll creado");
    onOpenChange(false);
  }, [state.ok, isEditing, onOpenChange]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  const errors = state.fieldErrors;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>
            {isEditing ? "Editar bankroll" : "Nuevo bankroll"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Actualiza el nombre, la moneda o el capital inicial."
              : "Separa el capital que vas a dedicar a apostar."}
          </SheetDescription>
        </SheetHeader>

        <form ref={formRef} action={formAction} className="space-y-4 px-4">
          {bankroll && <input type="hidden" name="id" value={bankroll.id} />}

          {state.error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{state.error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bankroll-name">Nombre</Label>
            <Input
              id="bankroll-name"
              name="name"
              placeholder="Bankroll principal"
              defaultValue={bankroll?.name}
              required
              maxLength={40}
              className="h-12"
              aria-invalid={Boolean(errors?.name)}
              aria-describedby={errors?.name ? "bankroll-name-error" : undefined}
            />
            {errors?.name && (
              <p id="bankroll-name-error" className="text-xs text-destructive">
                {errors.name[0]}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bankroll-amount">Capital inicial</Label>
              <Input
                id="bankroll-amount"
                name="initialAmount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={bankroll?.initialAmount ?? ""}
                required
                className="h-12"
                aria-invalid={Boolean(errors?.initialAmount)}
                aria-describedby={
                  errors?.initialAmount ? "bankroll-amount-error" : undefined
                }
              />
              {errors?.initialAmount && (
                <p
                  id="bankroll-amount-error"
                  className="text-xs text-destructive"
                >
                  {errors.initialAmount[0]}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bankroll-currency">Moneda</Label>
              <Select
                name="currency"
                defaultValue={bankroll?.currency ?? "PEN"}
              >
                <SelectTrigger
                  id="bankroll-currency"
                  className="h-12 w-full"
                  aria-label="Moneda"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} · {currency.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Puedes usar coma o punto decimal: 1000,50 o 1000.50.
          </p>

          <SheetFooter className="px-0">
            <Button type="submit" className="h-12 w-full" disabled={pending}>
              {pending
                ? "Guardando…"
                : isEditing
                  ? "Guardar cambios"
                  : "Crear bankroll"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
