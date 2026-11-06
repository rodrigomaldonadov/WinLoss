import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Percent,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { auth } from "@/auth";
import { BetRow } from "@/components/bets/bet-row";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import { getBankrollsForUser } from "@/lib/data/bankrolls";
import { getRecentBets } from "@/lib/data/bets";
import { formatCurrency, formatPercent } from "@/lib/format";

export const metadata: Metadata = {
  title: "Resumen",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [bankrolls, recentBets] = await Promise.all([
    getBankrollsForUser(session.user.id),
    getRecentBets(session.user.id, 5),
  ]);

  const currency = bankrolls[0]?.currency ?? DEFAULT_CURRENCY;
  const totals = bankrolls.reduce(
    (acc, bankroll) => ({
      current: acc.current + bankroll.currentBankroll,
      initial: acc.initial + bankroll.initialAmount,
      profit: acc.profit + bankroll.profit,
      pendingCount: acc.pendingCount + bankroll.pendingCount,
      pendingStake: acc.pendingStake + bankroll.pendingStake,
    }),
    { current: 0, initial: 0, profit: 0, pendingCount: 0, pendingStake: 0 },
  );

  const roi = totals.initial > 0 ? totals.profit / totals.initial : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resumen"
        description="Tu rendimiento, de un vistazo."
        action={
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/bets/new">Registrar apuesta</Link>
          </Button>
        }
      />

      <section
        aria-label="Métricas principales"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <StatCard
          label="Bankroll actual"
          value={formatCurrency(totals.current, currency)}
          hint={
            bankrolls.length > 0
              ? `${bankrolls.length} bankroll${bankrolls.length === 1 ? "" : "s"}`
              : "Capital disponible"
          }
          icon={Wallet}
        />
        <StatCard
          label="Beneficio"
          value={formatCurrency(totals.profit, currency)}
          hint="Apuestas liquidadas"
          tone={
            totals.profit > 0
              ? "success"
              : totals.profit < 0
                ? "loss"
                : "default"
          }
          icon={ArrowUpRight}
        />
        <StatCard
          label="ROI"
          value={formatPercent(roi)}
          hint="Sobre capital inicial"
          tone={roi > 0 ? "success" : roi < 0 ? "loss" : "default"}
          icon={Percent}
        />
        <StatCard
          label="Pendientes"
          value={String(totals.pendingCount)}
          hint={
            totals.pendingCount > 0
              ? `${formatCurrency(totals.pendingStake, currency)} en juego`
              : "Sin apuestas abiertas"
          }
          icon={Ticket}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Actividad reciente</h2>
          <Link
            href="/bets"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver todas
          </Link>
        </div>

        {recentBets.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="Tu historial empieza aquí"
            description="Registra tu primera apuesta y calcularemos automáticamente tu ROI, yield y la evolución del bankroll."
            action={
              <Button asChild>
                <Link href="/bets/new">Registrar primera apuesta</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
            {recentBets.map((bet) => (
              <li key={bet.id}>
                <BetRow bet={bet} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Evolución del bankroll</h2>
            <p className="text-xs text-muted-foreground">Últimos 30 días</p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            Sin datos
          </span>
        </div>
        <div className="mt-4 flex h-36 items-center justify-center rounded-lg border border-dashed bg-muted/20">
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <TrendingUp className="size-6" strokeWidth={1.7} aria-hidden />
            <p className="text-xs">
              La curva aparecerá con tus primeras apuestas
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
