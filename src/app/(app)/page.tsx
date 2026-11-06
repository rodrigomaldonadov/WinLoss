import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Percent,
  Target,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { auth } from "@/auth";
import { BetRow } from "@/components/bets/bet-row";
import { EmptyState } from "@/components/empty-state";
import { ExportBetsButton } from "@/components/bets/export-bets-button";
import { PageHeader } from "@/components/page-header";
import { getClosingLineValueByBookmaker, getRecentBets } from "@/lib/data/bets";
import { getUserPreferences } from "@/lib/data/user";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DEFAULT_CURRENCY } from "@/lib/constants";
import {
  getBankrollsForUser,
  getBankrollHistory,
  calculateDrawdown,
} from "@/lib/data/bankrolls";
import { calculateAverageClosingLineValue } from "@/lib/bet-math";
import { formatCurrency, formatPercent } from "@/lib/format";
import { BankrollLineChart } from "@/components/charts/bankroll-line-chart";
import { SportsPieChart } from "@/components/charts/sports-pie-chart";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Resumen",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [bankrolls, recentBets, preferences] = await Promise.all([
    getBankrollsForUser(session.user.id),
    getRecentBets(session.user.id, 10),
    getUserPreferences(session.user.id),
  ]);

  const hasBankroll = bankrolls.length > 0;
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

  const allBets = bankrolls.flatMap((bankroll) => bankroll.bets ?? []);
  const settledBets = allBets.filter((bet) => bet.status !== "PENDING");
  const wonBets = settledBets.filter(
    (bet) => bet.status === "WON" || bet.status === "HALF_WON",
  );
  const winRate = settledBets.length > 0 ? wonBets.length / settledBets.length : 0;

  // CLV (fracción; formatPercent la convierte a %)
  const clv = calculateAverageClosingLineValue(allBets);
  const clvByBookmaker = await getClosingLineValueByBookmaker(session.user.id);

  const drawdown = await calculateDrawdown(session.user.id);
  const showDrawdownAlert = hasBankroll && drawdown.thresholdExceeded;

  const history = await getBankrollHistory(session.user.id, 180);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resumen"
        description="Tu rendimiento, de un vistazo."
        action={
          <div className="flex items-center gap-2">
            {hasBankroll && <ExportBetsButton />}
            <Button asChild className="hidden sm:inline-flex">
              <Link href={hasBankroll ? "/bets/new" : "/bankroll"}>
                {hasBankroll ? "Registrar apuesta" : "Crear bankroll"}
              </Link>
            </Button>
          </div>
        }
      />

      {/* 1. Alertas críticas primero */}
      {showDrawdownAlert && (
        <Alert
          variant="destructive"
          title="Cuidado con tu bankroll"
          description={
            <>
              Tu balance actual{" "}
              <strong>{formatCurrency(drawdown.currentBankroll, currency)}</strong>{" "}
              ha caído un{" "}
              <strong>{Math.round((1 - drawdown.drawdown) * 100)}%</strong>{" "}
              respecto a tu saldo inicial{" "}
              <strong>{formatCurrency(drawdown.initialBankroll, currency)}</strong>.
              Te recomendamos pausar nuevas apuestas y revisar tu gestión de
              riesgo.
            </>
          }
          action={
            <Button asChild variant="outline">
              <Link href="/settings">Revisar ajustes</Link>
            </Button>
          }
        />
      )}

      {!hasBankroll ? (
        <EmptyState
          icon={Wallet}
          title="Crea tu bankroll para empezar"
          description="El bankroll es el capital que destinas a apostar. A partir de él calculamos ROI, beneficio, drawdown y CLV."
          action={
            <Button asChild>
              <Link href="/bankroll">Crear bankroll</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* 2. Métricas */}
          <section
            aria-label="Métricas principales"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
          >
            <StatCard
              label="Bankroll actual"
              value={formatCurrency(totals.current, currency)}
              hint={`${bankrolls.length} bankroll${bankrolls.length === 1 ? "" : "s"}`}
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
              label="Acierto"
              value={formatPercent(winRate)}
              hint={`${wonBets.length}/${settledBets.length} liquidadas`}
              tone={
                winRate > 0.5 ? "success" : winRate > 0 ? "default" : "default"
              }
              icon={Target}
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
            <StatCard
              label="CLV"
              value={clv !== null ? formatPercent(clv, { signed: true }) : "—"}
              hint={
                clv !== null
                  ? "Promedio de trades con cierre"
                  : "Sin cuotas de cierre"
              }
              tone={
                clv !== null && clv.gt(0)
                  ? "success"
                  : clv !== null && clv.lt(0)
                    ? "loss"
                    : "default"
              }
              icon={TrendingUp}
            />
          </section>

          {/* 3. CLV por casa: solo si hay datos */}
          {clvByBookmaker.length > 0 && (
            <section
              aria-label="CLV por casa de apuestas"
              className="rounded-xl border bg-card p-4 shadow-xs"
            >
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">CLV por casa</h2>
                <span className="text-[11px] text-muted-foreground">
                  Mejor a peor
                </span>
              </div>
              <ul className="space-y-2">
                {clvByBookmaker.map((item) => (
                  <li
                    key={item.bookmakerId ?? "none"}
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {item.bookmakerName}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-semibold tabular-nums",
                        item.averageClosingLineValue?.gt(0)
                          ? "text-success"
                          : item.averageClosingLineValue?.lt(0)
                            ? "text-loss"
                            : "text-muted-foreground",
                      )}
                    >
                      {item.averageClosingLineValue !== null
                        ? formatPercent(item.averageClosingLineValue, {
                            decimals: 1,
                            signed: true,
                          })
                        : "—"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.betsCount} ap.
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 4. Actividad reciente */}
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
                description="Registra tu primera apuesta y calcularemos automáticamente tu ROI, acierto y la evolución del bankroll."
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

          {/* 5. Análisis */}
          <section className="rounded-xl border bg-card p-4 shadow-xs">
            <h2 className="mb-3 text-sm font-semibold">Análisis</h2>
            <Tabs defaultValue="evolucion">
              <TabsList className="mb-4">
                <TabsTrigger value="evolucion">Evolución</TabsTrigger>
                <TabsTrigger value="distribucion">Distribución</TabsTrigger>
              </TabsList>

              <TabsContent value="evolucion">
                <BankrollLineChart
                  bankrolls={history}
                  currency={currency}
                  timeZone={preferences.timezone}
                  height={260}
                />
              </TabsContent>

              <TabsContent value="distribucion">
                <SportsPieChart bets={allBets} height={260} />
              </TabsContent>
            </Tabs>
          </section>
        </>
      )}
    </div>
  );
}
