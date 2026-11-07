import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Globe, Landmark, LogOut, Palette, Store, Wallet } from "lucide-react";

import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { UserProfileSheet } from "@/components/settings/user-profile-sheet";
import { AutoSettlePreference } from "@/components/settings/auto-settle-preference";
import { DebtPreferences } from "@/components/settings/debt-preferences";
import { ModelVersionsPanel } from "@/components/settings/model-versions-panel";
import { ThemePreference } from "@/components/settings/theme-preference";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";
import { getBookmakersForUser } from "@/lib/data/bookmakers";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_DEBT_ALERT_THRESHOLD,
  DEFAULT_USD_TO_PEN_RATE,
} from "@/lib/constants";
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
      autoSettleMode: true,
      usdToPenRate: true,
      debtAlertThresholdPct: true,
      showDebts: true,
      createdAt: true,
    },
  });

  if (!user) redirect("/login");

  const bookmakers = await getBookmakersForUser(session.user.id);

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
        <UserProfileSheet userName={user.name} email={user.email} />
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

        <div className="flex flex-col gap-3 border-t px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Palette className="size-[18px] text-muted-foreground" aria-hidden />
            <span className="text-sm">Tema</span>
          </div>
          <div className="sm:w-56">
            <ThemePreference />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
        <div>
          <h2 className="text-sm font-semibold">Liquidación automática</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Solo se liquidan mercados estructurados (1X2, doble oportunidad,
            DNB, goles y BTTS) cuando el proveedor confirma el resultado final.
            Los mercados manuales siempre se revisan a mano.
          </p>
        </div>
        <AutoSettlePreference mode={user.autoSettleMode} />
      </section>

      <ModelVersionsPanel />

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="size-4 text-muted-foreground" aria-hidden />
            Deudas y alertas
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Configura la tasa manual USD → PEN y el umbral de los avisos de
            juego responsable. Las deudas no modifican tu ROI ni tu yield.
          </p>
        </div>
        <DebtPreferences
          usdToPenRate={
            user.usdToPenRate
              ? Number(user.usdToPenRate)
              : DEFAULT_USD_TO_PEN_RATE
          }
          thresholdPct={
            user.debtAlertThresholdPct !== null &&
            user.debtAlertThresholdPct !== undefined
              ? Number(user.debtAlertThresholdPct)
              : DEFAULT_DEBT_ALERT_THRESHOLD
          }
          showDebts={user.showDebts}
        />
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <h2 className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Datos
        </h2>
        <Link
          href="/settings/bookmakers"
          className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-muted/60"
        >
          <Store className="size-[18px] text-muted-foreground" aria-hidden />
          <span className="flex-1 text-sm">Casas de apuestas</span>
          <span className="text-xs text-muted-foreground">
            {bookmakers.length === 0
              ? "Sin registrar"
              : `${bookmakers.length} registrada${bookmakers.length === 1 ? "" : "s"}`}
          </span>
          <ChevronRight
            className="size-4 text-muted-foreground"
            aria-hidden
          />
        </Link>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="text-sm font-semibold">Cuenta</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Miembro desde{" "}
          {formatDate(user.createdAt, {
            month: "long",
            year: "numeric",
            timeZone: user.timezone,
          })}.
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
