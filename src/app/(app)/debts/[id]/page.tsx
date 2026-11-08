import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Landmark,
  Percent,
  RefreshCw,
  Wallet,
} from "lucide-react";

import { auth } from "@/auth";
import { DeleteDebtButton } from "@/components/debts/delete-debt-button";
import { RegisterPaymentSheet } from "@/components/debts/register-payment-sheet";
import { VoidPaymentButton } from "@/components/debts/void-payment-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { getDebtForUser } from "@/lib/data/debts";
import { getExchangeRates } from "@/lib/data/exchange-rates";
import { getUserPreferences } from "@/lib/data/user";
import { getDebtStatusMeta } from "@/lib/debt-display";
import { toZonedDateTimeInput } from "@/lib/date";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Deuda",
};

type DebtDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DebtDetailPage({
  params,
  searchParams,
}: DebtDetailPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const query = await searchParams;
  const openPayment = Array.isArray(query.pagar)
    ? query.pagar[0] === "1"
    : query.pagar === "1";
  const [debt, preferences, exchangeRates] = await Promise.all([
    getDebtForUser(session.user.id, id),
    getUserPreferences(session.user.id),
    getExchangeRates(session.user.id),
  ]);

  if (!debt) notFound();

  const meta = getDebtStatusMeta(debt.status, debt.isOverdue);
  const today = toZonedDateTimeInput(
    new Date(),
    preferences.timezone,
  ).slice(0, 10);
  const progress = Math.round(debt.progress * 100);

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href="/debts">
            <ArrowLeft className="size-4" aria-hidden />
            Volver
          </Link>
        </Button>
        <Badge variant="outline" className={cn("font-normal", meta.className)}>
          {meta.label}
        </Badge>
      </div>

      <PageHeader
        className="pb-0"
        title={debt.lenderName}
        description={`Bankroll ${debt.bankrollName} · ${debt.currency}`}
      />

      {debt.isOverdue && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden
          />
          <p className="text-muted-foreground">
            Esta deuda está vencida. Revisa el saldo y registra un pago.
          </p>
        </div>
      )}

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Saldo pendiente
            </p>
            <p className="mt-0.5 text-2xl font-semibold break-words tabular-nums">
              {formatCurrency(debt.balance, debt.currency)}
            </p>
          </div>
          <div className="min-w-0 text-right text-xs text-muted-foreground">
            <p className="break-words">
              {formatCurrency(debt.paid, debt.currency)} pagado
            </p>
            <p>{progress}%</p>
          </div>
        </div>

        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="Progreso de pago"
        >
          <span
            className="block h-full rounded-full bg-success"
            style={{ width: `${progress}%` }}
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-[10px] text-muted-foreground">Principal</dt>
            <dd className="mt-0.5 font-medium break-words tabular-nums">
              {formatCurrency(debt.principal, debt.currency)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] text-muted-foreground">Interés</dt>
            <dd className="mt-0.5 font-medium break-words tabular-nums">
              {formatCurrency(debt.interest, debt.currency)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] text-muted-foreground">Vencimiento</dt>
            <dd className="mt-0.5 font-medium">
              {debt.dueDate ? formatDate(debt.dueDate) : "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] text-muted-foreground">
              Interés mensual
            </dt>
            <dd className="mt-0.5 font-medium">
              {debt.interestRateMonthly !== null
                ? `${debt.interestRateMonthly}%`
                : "Sin interés"}
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            Prestado {formatDate(debt.borrowedAt)}
          </span>
          <span className="flex items-center gap-1">
            <Landmark className="size-3.5 shrink-0" aria-hidden />
            {formatCurrency(debt.equivalentPen, "PEN")} aprox.
          </span>
          {debt.exchangeRate !== null && (
            <span className="flex items-center gap-1">
              <RefreshCw className="size-3.5 shrink-0" aria-hidden />
              {debt.rateKind === "BUY"
                ? "Compra"
                : debt.rateKind === "SELL"
                  ? "Venta"
                  : "Tasa"}{" "}
              {debt.exchangeRate}
              {debt.rateLabel ? ` · ${debt.rateLabel}` : ""}
            </span>
          )}
          {debt.notes && (
            <span className="max-w-full break-words">{debt.notes}</span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-xl border bg-card p-3 shadow-xs">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Ganancia disponible
          </p>
          <p className="mt-0.5 text-sm font-semibold break-words tabular-nums">
            {formatCurrency(debt.availableProfit, debt.bankrollCurrency)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Solo apuestas liquidadas
          </p>
        </div>
        <div className="min-w-0 rounded-xl border bg-card p-3 shadow-xs">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Saldo libre del bankroll
          </p>
          <p className="mt-0.5 text-sm font-semibold break-words tabular-nums">
            {formatCurrency(debt.freeBankrollBalance, debt.bankrollCurrency)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Sin stakes pendientes
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {debt.status !== "PAID" && (
          <RegisterPaymentSheet
            debt={debt}
            usdToPenRate={preferences.usdToPenRate}
            today={today}
            rates={exchangeRates}
            defaultOpen={openPayment}
            trigger={
              <Button type="button" className="h-11">
                Registrar pago
              </Button>
            }
          />
        )}
        <DeleteDebtButton
          debtId={debt.id}
          disabled={debt.paymentsCount > 0}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Pagos</h2>
          <span className="text-[11px] text-muted-foreground">
            {debt.payments.length} registro{debt.payments.length === 1 ? "" : "s"}
          </span>
        </div>

        {debt.payments.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
            <Wallet
              className="mx-auto size-7 text-muted-foreground"
              aria-hidden
            />
            <p className="mt-2 text-sm font-medium">Sin pagos todavía</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Puedes pagar todo o en partes, desde el bankroll o por fuera.
            </p>
          </div>
        ) : (
          <ol className="relative space-y-2 border-l border-border pl-4">
            {debt.payments.map((payment) => {
              const voided = Boolean(payment.voidedAt);
              return (
                <li
                  key={payment.id}
                  className={cn(
                    "relative rounded-xl border bg-card p-3 shadow-xs",
                    voided && "opacity-60",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -left-[21px] top-4 size-2.5 rounded-full ring-4 ring-background",
                      voided
                        ? "bg-muted-foreground/50"
                        : payment.source === "FROM_BANKROLL"
                          ? "bg-primary"
                          : "bg-success",
                    )}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold break-words tabular-nums">
                        {formatCurrency(payment.amount, debt.currency)}
                      </p>
                      <p className="mt-0.5 text-[11px] break-words text-muted-foreground">
                        {formatDateTime(payment.paidAt, preferences.timezone)} ·{" "}
                        {payment.source === "FROM_BANKROLL"
                          ? "Desde el bankroll"
                          : "Pagado aparte"}
                        {payment.exchangeRate !== null
                          ? ` · tasa ${payment.exchangeRate}${
                              payment.rateLabel
                                ? ` (${payment.rateKind === "SELL" ? "venta" : "compra"} ${payment.rateLabel})`
                                : ""
                            }`
                          : ""}
                      </p>
                      {payment.note && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {payment.note}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {voided ? (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          Anulado
                        </span>
                      ) : (
                        <VoidPaymentButton paymentId={payment.id} />
                      )}
                      {voided && payment.voidedAt && (
                        <p className="text-[10px] text-muted-foreground">
                          {formatDate(payment.voidedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {debt.interestRateMonthly !== null && (
        <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
          <Percent className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Interés simple prorrateado por días (mes de 30 días). Se detiene al
          completar el pago.
        </p>
      )}
    </div>
  );
}
