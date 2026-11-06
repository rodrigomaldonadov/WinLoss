import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { BetActionsSheet } from "@/components/bets/bet-actions-sheet";
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
};

const MAX_VISIBLE_LEGS = 3;

export function BetCard({ bet }: BetCardProps) {
  const status = getBetStatusMeta(bet.status);
  const currency = bet.bankroll.currency;
  const pending = bet.status === "PENDING";
  const typeLabel = getBetTypeLabel(bet);

  const potentialPayout = bet.isFreeBet
    ? bet.stake * (bet.odds - 1)
    : bet.stake * bet.odds;

  const closingValue = calculateBetClosingLineValue(bet.legs);
  const closingPercentage =
    closingValue !== null ? closingValue.value.toNumber() : null;

  const visibleLegs = bet.legs.slice(0, MAX_VISIBLE_LEGS);
  const hiddenLegs = bet.legs.length - visibleLegs.length;

  return (
    <article className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {typeLabel}
            </Badge>
            <p className="truncate text-xs text-muted-foreground">
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
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {bet.legs[0]?.selections
                .map((selection) => selection.selection)
                .join(" · ") ?? `${bet.market} · ${bet.selection}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge className={status.badgeClassName}>{status.label}</Badge>
          {bet.isFreeBet && (
            <span className="text-[10px] font-medium text-primary">Free bet</span>
          )}
        </div>
      </div>

      {bet.legs.length > 1 && (
        <ul className="mt-3 space-y-2 border-t pt-3">
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
                    {formatOdds(leg.odds)}
                  </p>
                  {!pending && (
                    <p className={cn("text-[10px]", legStatus.textClassName)}>
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

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
        <div>
          <dt className="text-[11px] text-muted-foreground">Cuota</dt>
          <dd className="mt-0.5 text-xs font-medium tabular-nums">
            {formatOdds(bet.odds)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Stake</dt>
          <dd className="mt-0.5 text-xs font-medium tabular-nums">
            {formatCurrency(bet.stake, currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">
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
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
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

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {formatDateTime(bet.placedAt)} · {bet.bankroll.name}
          {bet.bookmaker ? ` · ${bet.bookmaker.name}` : ""}
          {bet.externalId ? ` · #${bet.externalId}` : ""}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {pending && <SettleBetSheet bet={bet} />}
          <BetActionsSheet bet={bet} />
        </div>
      </div>
    </article>
  );
}
