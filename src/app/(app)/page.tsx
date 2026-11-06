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
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import {
  getBankrollsForUser,
  getBankrollHistory,
  calculateDrawdown,
} from "@/lib/data/bankrolls";
import { getRecentBets } from "@/lib/data/bets";
import { formatCurrency, formatPercent } from "@/lib/format";
import { BetRowProps } from "@/components/bets/bet-row";
import { BankrollLineChart } from "@/components/charts/bankroll-line-chart";
import { SportsPieChart } from "@/components/charts/sports-pie-chart";

export const metadata: Metadata = {
  title: "Resumen",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [bankrolls, recentBets] = await Promise.all([
    getBankrollsForUser(session.user.id),
    getRecentBets(session.user.id, 10),
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

  // ─── DRAWDOWN & ALERT ───────────────────────────────────────────────
  const drawdown = await calculateDrawdown(session.user.id);
  const showDrawdownAlert = drawdown.thresholdExceeded;

  // ─── HISTÓRICO PARA EL LINE CHART ──────────────────────────────────
  const history = await getBankrollHistory(session.user.id, 180);

  // ─── COMPONENTS RESPONSIVE ─────────────────────────────────────────
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

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

      {/* ── ALERTA DE DRAWDOWN ──────────────────────────────────────── */}
      {showDrawdownAlert && (
        <Alert
          variant="destructive"
          title="Cuidado con tu bankroll"
          description="Tu balance actual {formatCurrency(drawdown.currentBankroll, currency)} ha caído un {((1 - drawdown.drawdown) * 100).toFixed(0)}% respecto a tu saldo inicial {formatCurrency(drawdown.initialBankroll, currency)}. Te recomendamos pausar nuevas apuestas y revisar tu gestión de riesgo."
          action={<Button variant="outline" className="mt-2" onClick={() => window.location.href = "/settings"}>Ajustes</Button>}
        />
      )}

      {/* ── ACTIVIDAD RECENTE ───────────────────────────────────────── */}
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

      {/* ── GRÁFICOS RESPONSIVE CON TABS ─────────────────────────────── */}
      <section
        className={cn(
          "rounded-xl border bg-card p-4 shadow-xs",
          "mt-4",
        )}
      >
        <h2 className="text-sm font-semibold">Análisis</h2>

        {/* Tabs: móvil = pestañas separadas; desktop = grid lado a lado */}
        {isMobile ? (
          // MÓVIL: Tabs con dos paneles
          <Tabs defaultValue="evolucion" className="mb-4">
            <TabsList>
              <TabsTrigger value="evolucion">Evolución</TabsTrigger>
              <TabsTrigger value="distribución">Distribución</TabsTrigger>
            </TabsList>

            <TabsContent value="evolucion">
              <BankrollLineChart bankrolls={history} width={350} height={250} />
            </TabsContent>

            <TabsContent value="distribución">
              <SportsPieChart bets={recentBets} width={350} height={250} />
            </TabsContent>
          </Tabs>
        ) : (
          // ESCRITORIO: grid 2×1 sin Tabs
          <div className="grid grid-cols-2 gap-4">
            <BankrollLineChart bankrolls={history} width={600} height={300} />
            <SportsPieChart bets={recentBets} width={600} height={300} />
          </div>
        )}
      </section>
    </div>
  );
}