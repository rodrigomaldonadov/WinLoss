import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ReceiptText } from "lucide-react";

import { auth } from "@/auth";
import { BetActionsSheet } from "@/components/bets/bet-actions-sheet";
import { SettleBetSheet } from "@/components/bets/settle-bet-sheet";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBetTypeLabel } from "@/lib/bet-display";
import { getBetStatusMeta } from "@/lib/bet-status";
import { calculateBetClosingLineValue } from "@/lib/bet-math";
import { getBetForUser } from "@/lib/data/bets";
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

  const preferences = await getUserPreferences(session.user.id);
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
          {pending && <SettleBetSheet bet={bet} />}
          <BetActionsSheet bet={bet} />
        </div>
      </div>

      <PageHeader
        title={bet.eventName}
        description={`${getBetTypeLabel(bet)} · ${formatDateTime(bet.placedAt, timeZone)}`}
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

        <ol className="space-y-3">
          {bet.legs.map((leg) => {
            const legStatus = getBetStatusMeta(leg.status);
            return (
              <li
                key={leg.id}
                className="rounded-xl border bg-card p-4 shadow-xs"
              >
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
