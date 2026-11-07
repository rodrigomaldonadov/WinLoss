import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BarChart3, ReceiptText } from "lucide-react";

import { auth } from "@/auth";
import { BetActionsSheet } from "@/components/bets/bet-actions-sheet";
import { SettleBetSheet } from "@/components/bets/settle-bet-sheet";
import { VerifyResultsButton } from "@/components/bets/verify-results-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBetTypeLabel } from "@/lib/bet-display";
import { getBetStatusMeta } from "@/lib/bet-status";
import { calculateBetClosingLineValue } from "@/lib/bet-math";
import { getBetForUser } from "@/lib/data/bets";
import { resolveHistoryMatchIds } from "@/lib/data/analysis-links";
import { getOpenDebtSuggestion } from "@/lib/data/debts";
import { getUserPreferences } from "@/lib/data/user";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatOdds,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Detalle de apuesta",
};

type BetDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function BetDetailPage({ params }: BetDetailPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const bet = await getBetForUser(session.user.id, id);

  if (!bet) notFound();

  const [preferences, debtSuggestion, analysisLinks] = await Promise.all([
    getUserPreferences(session.user.id),
    getOpenDebtSuggestion(session.user.id),
    resolveHistoryMatchIds(bet.legs),
  ]);
  const timeZone = preferences.timezone;

  const status = getBetStatusMeta(bet.status);
  const currency = bet.bankroll.currency;
  const pending = bet.status === "PENDING";
  const clv = calculateBetClosingLineValue(bet.legs);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href="/bets">
            <ArrowLeft className="size-4" aria-hidden />
            Volver
          </Link>
        </Button>
        <div className="flex items-center gap-1">
          {pending && (
            <SettleBetSheet
              bet={bet}
              debtSuggestion={
                preferences.showDebts ? debtSuggestion : null
              }
            />
          )}
          <BetActionsSheet bet={bet} />
        </div>
      </div>

      <PageHeader
        title={bet.eventName}
        description={`${getBetTypeLabel(bet)} · ${formatDateTime(bet.placedAt, timeZone)}`}
        action={<VerifyResultsButton />}
      />

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {bet.sport}
              {bet.competition ? ` · ${bet.competition}` : ""}
            </p>
            <p className="mt-1 text-sm font-medium">
              {bet.legs.length} partido{bet.legs.length === 1 ? "" : "s"}
              {bet.isFreeBet ? " · Free bet" : ""}
              {bet.oddsBoostPct !== null && bet.oddsBoostPct > 0
                ? ` · Boost +${
                    bet.oddsBoostPct % 1 === 0
                      ? bet.oddsBoostPct
                      : bet.oddsBoostPct.toFixed(2)
                  }%`
                : ""}
            </p>
            {bet.externalId && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Boleto #{bet.externalId}
              </p>
            )}
          </div>
          <Badge className={status.badgeClassName}>{status.label}</Badge>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
          <div>
            <dt className="text-[11px] text-muted-foreground">Cuota total</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">
              {formatOdds(bet.odds)}
              {bet.oddsBoostPct !== null && bet.oddsBoostPct > 0 && (
                <span className="ml-1 text-[10px] font-semibold text-primary">
                  +
                  {bet.oddsBoostPct % 1 === 0
                    ? bet.oddsBoostPct
                    : bet.oddsBoostPct.toFixed(2)}
                  %
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Stake</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">
              {formatCurrency(bet.stake, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Payout</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">
              {bet.payout === null
                ? "—"
                : formatCurrency(bet.payout, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Beneficio</dt>
            <dd
              className={cn(
                "mt-0.5 text-sm font-semibold tabular-nums",
                (bet.profit ?? 0) > 0 && "text-success",
                (bet.profit ?? 0) < 0 && "text-loss",
              )}
            >
              {bet.profit === null
                ? "—"
                : formatSignedCurrency(bet.profit, currency)}
            </dd>
          </div>
        </dl>

        <p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">
          {bet.bankroll.name}
          {bet.bookmaker ? ` · ${bet.bookmaker.name}` : ""}
          {bet.settledAt
            ? ` · Liquidada ${formatDateTime(bet.settledAt, timeZone)}`
            : ""}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold">Partidos y selecciones</h2>
        </div>

        <ol className="relative space-y-3 border-l border-border pl-4">
          {bet.legs.map((leg, index) => {
            const legStatus = getBetStatusMeta(leg.status);
            const done =
              leg.status === "WON" || leg.status === "HALF_WON";
            const lost =
              leg.status === "LOST" || leg.status === "HALF_LOST";
            return (
              <li
                key={leg.id}
                className="relative rounded-xl border bg-card p-4 shadow-xs"
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-[21px] top-5 size-2.5 rounded-full ring-4 ring-background",
                    done
                      ? "bg-success"
                      : lost
                        ? "bg-destructive"
                        : leg.status === "PENDING"
                          ? "bg-muted-foreground/60"
                          : "bg-muted-foreground",
                  )}
                />
                <span className="sr-only">Partido {index + 1}:</span>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold">
                        {leg.eventName}
                      </p>
                      {leg.isBuilder && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          Builder
                        </Badge>
                      )}
                      {leg.autoSettled && (
                        <Badge className="px-1.5 py-0 text-[10px]">
                          Auto
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {leg.sport}
                      {leg.competition ? ` · ${leg.competition}` : ""}
                      {leg.eventDate
                        ? ` · ${formatDate(leg.eventDate, {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            timeZone,
                          })}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge className={legStatus.badgeClassName}>
                      {legStatus.label}
                    </Badge>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {leg.scoreHome !== null && leg.scoreAway !== null
                        ? `${leg.scoreHome}-${leg.scoreAway} · `
                        : ""}
                      {formatOdds(leg.odds)}
                    </span>
                  </div>
                </div>

                <ul className="mt-3 space-y-1.5 border-t pt-3">
                  {leg.selections.map((selection) => (
                    <li
                      key={selection.id}
                      className="flex items-start justify-between gap-2 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {selection.market}
                      </span>
                      <span className="text-right font-medium">
                        {selection.selection}
                      </span>
                    </li>
                  ))}
                </ul>

                {leg.closingOdds !== null && (
                  <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
                    Cuota de cierre: {formatOdds(leg.closingOdds)}
                  </p>
                )}

                {analysisLinks.has(leg.id) && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="mt-2 h-9 w-full gap-1.5 text-xs"
                  >
                    <Link
                      href={`/analysis/historial/${analysisLinks.get(leg.id)}`}
                    >
                      <BarChart3 className="size-3.5" aria-hidden />
                      Ver análisis del partido
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {clv !== null && (
        <section className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 shadow-xs">
          <div>
            <p className="text-sm font-medium">Closing Line Value</p>
            <p className="text-[11px] text-muted-foreground">
              Producto de los CLV de los partidos con cuota de cierre.
            </p>
          </div>
          <span
            className={cn(
              "text-lg font-semibold tabular-nums",
              clv.value.gt(0)
                ? "text-success"
                : clv.value.lt(0)
                  ? "text-loss"
                  : "text-muted-foreground",
            )}
          >
            {formatPercent(clv.value, { decimals: 1, signed: true })}
          </span>
        </section>
      )}

      {bet.notes && (
        <section className="rounded-xl border bg-card p-4 text-sm shadow-xs">
          <h2 className="text-sm font-semibold">Notas</h2>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
            {bet.notes}
          </p>
        </section>
      )}
    </div>
  );
}
