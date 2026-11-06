"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert } from "lucide-react";

import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type AuthFormState } from "@/lib/actions/auth";

const initialState: AuthFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );
  const errors = state.fieldErrors;

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
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="tu@email.com"
          required
          className="h-12"
          aria-invalid={Boolean(errors?.email)}
          aria-describedby={errors?.email ? "email-error" : undefined}
        />
        {errors?.email && (
          <p id="email-error" className="text-xs text-destructive">
            {errors.email[0]}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          aria-invalid={Boolean(errors?.password)}
          aria-describedby={errors?.password ? "password-error" : undefined}
        />
        {errors?.password && (
          <p id="password-error" className="text-xs text-destructive">
            {errors.password[0]}
          </p>
        )}
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </div>

      <Button type="submit" className="h-12 w-full" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{" "}
        <Link
          href="/register"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}
