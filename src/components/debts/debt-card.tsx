import Link from "next/link";
import { CalendarDays, Percent } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DebtItem } from "@/lib/data/debts";
import { getDebtStatusMeta } from "@/lib/debt-display";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type DebtCardProps = {
  debt: DebtItem;
};

/** Tarjeta de deuda en el listado. */
export function DebtCard({ debt }: DebtCardProps) {
  const meta = getDebtStatusMeta(debt.status, debt.isOverdue);
  const progress = Math.round(debt.progress * 100);

  return (
    <Link
      href={`/debts/${debt.id}`}
      className="block min-w-0 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="truncate text-sm font-semibold">
              {debt.lenderName}
            </h2>
            <Badge variant="secondary" className="font-normal">
              {debt.currency}
            </Badge>
            <Badge variant="outline" className={cn("font-normal", meta.className)}>
              {meta.label}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Bankroll {debt.bankrollName} · {debt.currency}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums">
            {formatCurrency(debt.balance, debt.currency)}
          </p>
          <p className="text-[10px] text-muted-foreground">pendiente</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            {formatCurrency(debt.paid, debt.currency)} pagado
          </span>
          <span className="font-medium tabular-nums">{progress}%</span>
        </div>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label={`Progreso de pago de ${debt.lenderName}`}
        >
          <span
            className="block h-full rounded-full bg-success"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarDays className="size-3.5" aria-hidden />
          {debt.dueDate
            ? `Vence ${formatDate(debt.dueDate)}`
            : "Sin vencimiento"}
        </span>
        {debt.interestRateMonthly !== null && (
          <span className="flex items-center gap-1">
            <Percent className="size-3.5" aria-hidden />
            {debt.interestRateMonthly}% mensual
          </span>
        )}
        {debt.paymentsCount > 0 && (
          <span>
            {debt.paymentsCount} pago{debt.paymentsCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </Link>
  );
}
