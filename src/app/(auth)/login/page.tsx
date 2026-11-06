import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

type LoginPageProps = {
  searchParams: Promise<{ reset?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session?.user) redirect("/");

  const params = await searchParams;
  const passwordReset = Boolean(params.reset);

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Bienvenido de nuevo
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Entra para ver tu bankroll y tus métricas.
      </p>

      {passwordReset && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Contraseña actualizada. Inicia sesión con tu nueva contraseña.</p>
        </div>
      )}

      <LoginForm />
    </div>
  );
}
