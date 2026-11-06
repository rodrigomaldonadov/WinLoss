"use client";

import { useActionState, useEffect, useRef, useState, useCallback } from "react";
import { CircleAlert, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { updateUserAction, type AuthFormState } from "@/lib/actions/auth";

const initialState: AuthFormState = {};

type UserProfileSheetProps = {
  userName?: string | null;
  email?: string | null;
};

export function UserProfileSheet({
  userName,
  email,
}: UserProfileSheetProps) {
  const [open, setOpen] = useState(false);
  const handleOpenChange = useCallback((next: boolean) => setOpen(next), []);

  return (
    <UserProfileSheetDialog
      open={open}
      onOpenChange={handleOpenChange}
      userName={userName}
      email={email}
    />
  );
}

type UserProfileSheetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName?: string | null;
  email?: string | null;
};

function UserProfileSheetDialog({
  open,
  onOpenChange,
  userName,
}: UserProfileSheetDialogProps) {
  const [state, formAction, pending] = useActionState(updateUserAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const isEditing = Boolean(userName);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      toast.success("Perfil actualizado");
      onOpenChange(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, onOpenChange]);

  const errors = state.fieldErrors;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Editar perfil"
          className="-mr-2 size-9"
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-2">
          <SheetTitle>
            {isEditing ? "Editar perfil" : "Nuevo perfil"}
          </SheetTitle>
          <SheetDescription>
            Actualiza el nombre que aparece en tu cuenta.
          </SheetDescription>
        </SheetHeader>

        <form ref={formRef} action={formAction} className="space-y-5 px-4">
          {state.error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{state.error}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="user-name" className="text-sm font-medium">
              Nombre
            </Label>
            <Input
              id="user-name"
              name="name"
              placeholder="Tu nombre"
              defaultValue={userName ?? ""}
              required
              maxLength={60}
              className="h-12 w-full rounded-md border border-input bg-input px-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              aria-invalid={Boolean(errors?.name)}
              aria-describedby={errors?.name ? "user-name-error" : undefined}
            />
            {errors?.name && (
              <p id="user-name-error" className="text-xs text-destructive">
                {errors.name[0]}
              </p>
            )}
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" className="h-12 w-full" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
