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
  saveBookmaker,
  type BookmakerFormState,
} from "@/lib/actions/bookmaker";
import type { BookmakerSummary } from "@/lib/data/bookmakers";

const initialState: BookmakerFormState = {};

type BookmakerFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmaker?: BookmakerSummary;
};

export function BookmakerFormSheet({
  open,
  onOpenChange,
  bookmaker,
}: BookmakerFormSheetProps) {
  const [state, formAction, pending] = useActionState(
    saveBookmaker,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const isEditing = Boolean(bookmaker);

  useEffect(() => {
    if (!state.ok) return;

    formRef.current?.reset();
    toast.success(
      isEditing ? "Casa de apuestas actualizada" : "Casa de apuestas creada",
    );
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
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>
            {isEditing ? "Editar casa" : "Nueva casa de apuestas"}
          </SheetTitle>
          <SheetDescription>
            Añade la casa donde registras tus apuestas para filtrar y comparar después.
          </SheetDescription>
        </SheetHeader>

        <form ref={formRef} action={formAction} className="space-y-4 px-4">
          {bookmaker && <input type="hidden" name="id" value={bookmaker.id} />}

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
            <Label htmlFor="bookmaker-name">Nombre</Label>
            <Input
              id="bookmaker-name"
              name="name"
              placeholder="Ej. Betsson"
              defaultValue={bookmaker?.name}
              required
              maxLength={40}
              className="h-12"
              aria-invalid={Boolean(errors?.name)}
              aria-describedby={errors?.name ? "bookmaker-name-error" : undefined}
            />
            {errors?.name && (
              <p id="bookmaker-name-error" className="text-xs text-destructive">
                {errors.name[0]}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bookmaker-currency">Moneda</Label>
              <Select
                name="currency"
                defaultValue="PEN"
              >
                <SelectTrigger
                  id="bookmaker-currency"
                  className="h-12 w-full"
                  aria-label="Moneda"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} - {currency.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Ingresa el nombre exacto de la casa de apuestas.
          </p>

          <SheetFooter className="px-0">
            <Button type="submit" className="h-12 w-full" disabled={pending}>
              {pending
                ? "Guardando…?"
                : isEditing
                  ? "Guardar cambios"
                  : "Añadir casa"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}