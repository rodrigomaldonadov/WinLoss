import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Globe, LogOut, Wallet } from "lucide-react";

import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, getInitials } from "@/lib/format";

export const metadata: Metadata = {
  title: "Ajustes",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      currency: true,
      timezone: true,
      createdAt: true,
    },
  });

  if (!user) redirect("/login");

  const rows = [
    {
      icon: Wallet,
      label: "Moneda base",
      value: user.currency,
    },
    {
      icon: Globe,
      label: "Zona horaria",
      value: user.timezone,
    },
  ] as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ajustes"
        description="Cuenta y preferencias de la app."
      />

      <section className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {getInitials(user.name, user.email)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {user.name ?? "Sin nombre"}
          </p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <h2 className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preferencias
        </h2>
        <ul className="divide-y">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.label} className="flex items-center gap-3 px-4 py-3.5">
                <Icon className="size-[18px] text-muted-foreground" aria-hidden />
                <span className="flex-1 text-sm">{row.label}</span>
                <span className="text-xs text-muted-foreground">{row.value}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="text-sm font-semibold">Cuenta</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Miembro desde{" "}
          {formatDate(user.createdAt, { month: "long", year: "numeric" })}.
        </p>
        <form action={signOutAction} className="mt-4">
          <Button
            type="submit"
            variant="outline"
            className="h-11 w-full justify-start gap-2 text-destructive hover:text-destructive sm:w-auto"
          >
            <LogOut className="size-4" aria-hidden />
            Cerrar sesión
          </Button>
        </form>
      </section>

      <p className="px-1 text-center text-[11px] text-muted-foreground">
        WinLoss · Versión 0.1.0 · Juego responsable +18
      </p>
    </div>
  );
}
