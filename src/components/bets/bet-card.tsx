import Link from "next/link";
import { CopyPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BetActionsSheet } from "@/components/bets/bet-actions-sheet";
import { QuickSettleButtons } from "@/components/bets/quick-settle-buttons";
import { SettleBetSheet } from "@/components/bets/settle-bet-sheet";
import { getBetTypeLabel } from "@/lib/bet-display";
import { getBetStatusMeta } from "@/lib/bet-status";
import { calculateBetClosingLineValue } from "@/lib/bet-math";
import type { BetListItem } from "@/lib/data/bets";
import {
  formatCurrency,
  formatDateTime,
  formatOdds,
  formatPercent,
  formatSignedCurrency,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type BetCardProps = {
  bet: BetListItem;
  timeZone?: string;
};

const MAX_VISIBLE_LEGS = 3;

export function BetCard({ bet, timeZone }: BetCardProps) {
  const status = getBetStatusMeta(bet.status);
  const currency = bet.bankroll.currency;
  const pending = bet.status === "PENDING";
  const typeLabel = getBetTypeLabel(bet);

  const boostPct = bet.oddsBoostPct ?? 0;
  const effectiveOdds =
    boostPct > 0
      ? bet.legs.reduce((acc, leg) => acc * leg.odds, 1)
      : bet.odds;
  const potentialPayout =
    (bet.isFreeBet
      ? bet.stake * Math.max(0, effectiveOdds - 1)
      : bet.stake * effectiveOdds) *
    (1 + boostPct / 100);

  const closingValue = calculateBetClosingLineValue(bet.legs);
  const closingPercentage =
    closingValue !== null ? closingValue.value.toNumber() : null;

  const visibleLegs = bet.legs.slice(0, MAX_VISIBLE_LEGS);
  const hiddenLegs = bet.legs.length - visibleLegs.length;

  return (
    <article className="min-w-0 rounded-xl border bg-card p-3.5 shadow-xs sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {typeLabel}
            </Badge>
            {bet.legs.length > 1 && (
              <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                {bet.legs.filter((leg) => leg.status !== "PENDING").length}/
                {bet.legs.length} ✓
              </span>
            )}
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              {bet.sport}
              {bet.competition ? ` · ${bet.competition}` : ""}
            </p>
          </div>
          <h2 className="mt-1 truncate text-sm font-semibold">
            <Link href={`/bets/${bet.id}`} className="hover:underline">
              {bet.eventName}
            </Link>
          </h2>
          {bet.legs.length === 1 && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {bet.legs[0]?.selections
                .map((selection) => selection.selection)
                .join(" · ") ?? `${bet.market} · ${bet.selection}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge className={status.badgeClassName}>{status.label}</Badge>
          {bet.legs.length === 1 &&
            bet.legs[0]?.scoreHome !== null &&
            bet.legs[0]?.scoreAway !== null && (
              <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                {bet.legs[0].scoreHome}-{bet.legs[0].scoreAway}
              </span>
            )}
          {bet.legs.length === 1 && bet.legs[0]?.autoSettled && (
            <span className="rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary">
              Auto
            </span>
          )}
          {bet.isFreeBet && (
            <span className="text-[10px] font-medium text-primary">Free bet</span>
          )}
          {bet.oddsBoostPct !== null && bet.oddsBoostPct > 0 && (
            <span className="rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary">
              Boost +
              {bet.oddsBoostPct % 1 === 0
                ? bet.oddsBoostPct
                : bet.oddsBoostPct.toFixed(2)}
              %
            </span>
          )}
        </div>
      </div>

      {bet.legs.length > 1 && (
        <ul className="mt-2.5 space-y-1.5 border-t pt-2.5">
          {visibleLegs.map((leg) => {
            const legStatus = getBetStatusMeta(leg.status);
            return (
              <li
                key={leg.id}
                className="flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {leg.isBuilder ? "Builder · " : ""}
                    {leg.eventName}
                  </p>
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">
                    {leg.selections
                      .map(
                        (selection) =>
                          `${selection.market}: ${selection.selection}`,
                      )
                      .join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-medium tabular-nums">
                    {leg.scoreHome !== null && leg.scoreAway !== null
                      ? `${leg.scoreHome}-${leg.scoreAway} · `
                      : ""}
                    {formatOdds(leg.odds)}
                  </p>
                  {!pending && (
                    <p
                      className={cn(
                        "flex items-center justify-end gap-1 text-[10px]",
                        legStatus.textClassName,
                      )}
                    >
                      {leg.autoSettled && (
                        <span className="rounded bg-primary/10 px-1 font-semibold text-primary">
                          Auto
                        </span>
                      )}
                      {legStatus.label}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
          {hiddenLegs > 0 && (
            <li className="text-[11px] text-muted-foreground">
              +{hiddenLegs} partido{hiddenLegs === 1 ? "" : "s"} más
            </li>
          )}
        </ul>
      )}

      <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t pt-2.5">
        <div>
          <dt className="text-[10px] text-muted-foreground">Cuota</dt>
          <dd className="mt-0.5 text-xs font-medium tabular-nums">
            {formatOdds(bet.odds)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground">Stake</dt>
          <dd className="mt-0.5 text-xs font-medium tabular-nums">
            {formatCurrency(bet.stake, currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted-foreground">
            {pending
              ? bet.isFreeBet
                ? "Ganancia"
                : "Retorno"
              : "Beneficio"}
          </dt>
          <dd
            className={cn(
              "mt-0.5 text-xs font-semibold tabular-nums",
              !pending &&
                (bet.profit ?? 0) > 0 &&
                "text-success",
              !pending && (bet.profit ?? 0) < 0 && "text-loss",
            )}
          >
            {pending
              ? formatCurrency(potentialPayout, currency)
              : formatSignedCurrency(bet.profit ?? 0, currency)}
          </dd>
        </div>
      </dl>

      {!pending && closingValue && closingPercentage !== null && (
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">CLV</span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              closingPercentage > 0
                ? "text-success"
                : closingPercentage < 0
                  ? "text-loss"
                  : "text-muted-foreground",
            )}
          >
            {formatPercent(closingPercentage, { decimals: 1, signed: true })}
          </span>
        </div>
      )}

      {pending && bet.legs.length === 1 && (
        <QuickSettleButtons betId={bet.id} className="mt-2.5" />
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {formatDateTime(bet.placedAt, timeZone)} · {bet.bankroll.name}
          {bet.bookmaker ? ` · ${bet.bookmaker.name}` : ""}
          {bet.externalId ? ` · #${bet.externalId}` : ""}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label="Copiar apuesta"
          >
            <Link href={`/bets/new?copy=${bet.id}`}>
              <CopyPlus className="size-4" aria-hidden />
            </Link>
          </Button>
          {pending && <SettleBetSheet bet={bet} />}
          <BetActionsSheet bet={bet} />
        </div>
      </div>
    </article>
  );
}
