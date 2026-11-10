import Link from "next/link";

import { getBetTypeLabel } from "@/lib/bet-display";
import { getBetStatusMeta } from "@/lib/bet-status";
import type { BetListItem } from "@/lib/data/bets";
import {
  formatCurrency,
  formatOdds,
  formatSignedCurrency,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export type BetRowProps = {
  bet: BetListItem;
};

export function BetRow({ bet }: BetRowProps) {
  const status = getBetStatusMeta(bet.status);
  const currency = bet.bankroll.currency;
  const pending = bet.status === "PENDING";

  return (
    <Link
      href={`/bets/${bet.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-muted/60"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {bet.eventName}
          {bet.legs.length > 1 ? ` +${bet.legs.length - 1}` : ""}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {getBetTypeLabel(bet)} · {bet.selection} · {formatOdds(bet.odds)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            !pending &&
              (bet.profit ?? 0) > 0 &&
              "text-success",
            !pending && (bet.profit ?? 0) < 0 && "text-loss",
          )}
        >
          {pending
            ? formatCurrency(bet.stake, currency)
            : formatSignedCurrency(bet.profit ?? 0, currency)}
        </p>
        <p className={cn("text-[0.6875rem]", status.textClassName)}>
          {status.label}
        </p>
      </div>
    </Link>
  );
}
