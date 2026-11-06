import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
};

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Recupera tu cuenta
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Indica tu email y te enviaremos un enlace para crear una contraseña
        nueva.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
