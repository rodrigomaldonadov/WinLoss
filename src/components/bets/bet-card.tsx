import { Badge } from "@/components/ui/badge";
import { BetActionsSheet } from "@/components/bets/bet-actions-sheet";
import { SettleBetSheet } from "@/components/bets/settle-bet-sheet";
import { getBetStatusMeta } from "@/lib/bet-status";
import type { BetListItem } from "@/lib/data/bets";
import {
  formatCurrency,
  formatDateTime,
  formatOdds,
  formatSignedCurrency,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type BetCardProps = {
  bet: BetListItem;
};

export function BetCard({ bet }: BetCardProps) {
  const status = getBetStatusMeta(bet.status);
  const currency = bet.bankroll.currency;
  const pending = bet.status === "PENDING";

  const potentialPayout = bet.isFreeBet
    ? bet.stake * (bet.odds - 1)
    : bet.stake * bet.odds;

  return (
    <article className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">
            {bet.sport}
            {bet.competition ? ` · ${bet.competition}` : ""}
          </p>
          <h2 className="mt-0.5 truncate text-sm font-semibold">
            {bet.eventName}
          </h2>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {bet.market} · <span className="text-foreground">{bet.selection}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge className={status.badgeClassName}>{status.label}</Badge>
          {bet.isFreeBet && (
            <span className="text-[10px] font-medium text-primary">Free bet</span>
          )}
        </div>
      </div>

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
            {pending ? "Retorno" : "Beneficio"}
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

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {formatDateTime(bet.placedAt)} · {bet.bankroll.name}
          {bet.bookmaker ? ` · ${bet.bookmaker.name}` : ""}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {pending && <SettleBetSheet bet={bet} />}
          <BetActionsSheet bet={bet} />
        </div>
      </div>
    </article>
  );
}
