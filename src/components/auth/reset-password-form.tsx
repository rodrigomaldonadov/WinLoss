"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert } from "lucide-react";

import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  resetPasswordAction,
  type PasswordResetState,
} from "@/lib/actions/password";

const initialState: PasswordResetState = {};

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initialState,
  );
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

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
        <Label htmlFor="reset-password">Nueva contraseña</Label>
        <PasswordInput
          id="reset-password"
          name="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          aria-invalid={Boolean(errors?.password)}
          aria-describedby={
            errors?.password ? "reset-password-error" : undefined
          }
        />
        {errors?.password && (
          <p id="reset-password-error" className="text-xs text-destructive">
            {errors.password[0]}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Usa al menos 8 caracteres.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reset-confirm">Repite la contraseña</Label>
        <PasswordInput
          id="reset-confirm"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          aria-invalid={Boolean(errors?.confirmPassword)}
          aria-describedby={
            errors?.confirmPassword ? "reset-confirm-error" : undefined
          }
        />
        {errors?.confirmPassword && (
          <p id="reset-confirm-error" className="text-xs text-destructive">
            {errors.confirmPassword[0]}
          </p>
        )}
      </div>

      <Button type="submit" className="h-12 w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
