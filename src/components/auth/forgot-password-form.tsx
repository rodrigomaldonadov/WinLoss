"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestPasswordResetAction,
  type PasswordResetState,
} from "@/lib/actions/password";

const initialState: PasswordResetState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );
  const errors = state.fieldErrors;

  if (state.ok) {
    return (
      <div className="mt-6 space-y-4">
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Si existe una cuenta con ese email, te enviamos un enlace para
            restablecer la contraseña. Revisa también la carpeta de spam.
          </p>
        </div>

        {state.resetUrl && (
          <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Entorno de desarrollo</p>
            <p className="mt-1">
              No hay proveedor de email configurado. Usa este enlace para
              continuar:
            </p>
            <Link
              href={state.resetUrl.replace(/^https?:\/\/[^/]+/, "")}
              className="mt-1 block break-all font-medium text-primary underline-offset-4 hover:underline"
            >
              Abrir enlace de restablecimiento
            </Link>
          </div>
        )}

        <Button asChild variant="outline" className="h-12 w-full">
          <Link href="/login">Volver a iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
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
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="tu@email.com"
          required
          className="h-12"
          aria-invalid={Boolean(errors?.email)}
          aria-describedby={errors?.email ? "forgot-email-error" : undefined}
        />
        {errors?.email && (
          <p id="forgot-email-error" className="text-xs text-destructive">
            {errors.email[0]}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Te enviaremos un enlace válido durante 30 minutos.
        </p>
      </div>

      <Button type="submit" className="h-12 w-full" disabled={pending}>
        {pending ? "Enviando…" : "Enviar enlace"}
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
