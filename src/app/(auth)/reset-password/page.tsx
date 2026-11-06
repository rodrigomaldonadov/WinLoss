import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleAlert } from "lucide-react";

import { auth } from "@/auth";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Nueva contraseña",
};

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const session = await auth();
  if (session?.user) redirect("/");

  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Crea una contraseña nueva
      </h1>

      {token ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Elige una contraseña segura. El enlace caduca a los 30 minutos.
          </p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <>
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Falta el enlace de restablecimiento. Solicita uno nuevo para
              continuar.
            </p>
          </div>
          <Button asChild className="mt-5 h-12 w-full">
            <Link href="/forgot-password">Solicitar enlace</Link>
          </Button>
        </>
      )}
    </div>
  );
}
