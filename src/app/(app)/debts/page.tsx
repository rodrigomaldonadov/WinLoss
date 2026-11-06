import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Download, Landmark, Plus } from "lucide-react";

import { auth } from "@/auth";
import { DebtCard } from "@/components/debts/debt-card";
import { NewDebtSheet } from "@/components/debts/new-debt-sheet";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  getDebtsForUser,
  getDebtSummaryForUser,
  type DebtFilter,
} from "@/lib/data/debts";
import { getUserBankrollOptions } from "@/lib/data/bankrolls";
import { getUserPreferences } from "@/lib/data/user";
import { formatCurrency, formatDate } from "@/lib/format";
import { toZonedDateTimeInput } from "@/lib/date";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Deudas",
};

const STATUS_FILTERS: { value: NonNullable<DebtFilter["status"]>; label: string }[] =
  [
    { value: "all", label: "Todas" },
    { value: "OPEN", label: "Abiertas" },
    { value: "PARTIAL", label: "Parciales" },
    { value: "PAID", label: "Pagadas" },
    { value: "overdue", label: "Vencidas" },
  ];

const CURRENCY_FILTERS: {
  value: NonNullable<DebtFilter["currency"]>;
  label: string;
}[] = [
  { value: "all", label: "Todas" },
  { value: "PEN", label: "S/" },
  { value: "USD", label: "US$" },
];

type DebtsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseStatus(value?: string | string[]): NonNullable<DebtFilter["status"]> {
  const raw = firstParam(value);
  return raw === "OPEN" ||
    raw === "PARTIAL" ||
    raw === "PAID" ||
    raw === "overdue"
    ? raw
    : "all";
}

function parseCurrency(
  value?: string | string[],
): NonNullable<DebtFilter["currency"]> {
  const raw = firstParam(value);
  return raw === "PEN" || raw === "USD" ? raw : "all";
}

function hrefFor({
  status,
  currency,
}: {
  status: NonNullable<DebtFilter["status"]>;
  currency: NonNullable<DebtFilter["currency"]>;
}): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("estado", status);
  if (currency !== "all") params.set("moneda", currency);
  const qs = params.toString();
  return qs ? `/debts?${qs}` : "/debts";
}

export default async function DebtsPage({ searchParams }: DebtsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const status = parseStatus(params.estado);
  const currency = parseCurrency(params.moneda);

  const [debtsResult, summary, bankrolls, preferences] = await Promise.all([
    getDebtsForUser(session.user.id, { status, currency }),
    getDebtSummaryForUser(session.user.id),
    getUserBankrollOptions(session.user.id),
    getUserPreferences(session.user.id),
  ]);

  const { debts } = debtsResult;
  const today = toZonedDateTimeInput(
    new Date(),
    preferences.timezone,
  ).slice(0, 10);
  const defaultCurrency = preferences.currency === "USD" ? "USD" : "PEN";

  return (
    <div className="space-y-4 pb-20">
      <PageHeader
        className="pb-0"
        title="Deudas"
        description="Préstamos al bankroll, pagos y saldo pendiente."
        action={
          <div className="flex items-center gap-1.5">
            <Button
              asChild
              variant="outline"
              size="icon"
              aria-label="Exportar deudas"
            >
              <a href="/api/export/debts" download>
                <Download className="size-4" aria-hidden />
              </a>
            </Button>
            {bankrolls.length > 0 && (
              <NewDebtSheet
                bankrolls={bankrolls}
                defaultCurrency={defaultCurrency}
                today={today}
                usdToPenRate={preferences.usdToPenRate}
                trigger={
                  <Button type="button" size="icon" aria-label="Nueva deuda">
                    <Plus className="size-5" aria-hidden />
                  </Button>
                }
              />
            )}
          </div>
        }
      />

      <section
        aria-label="Resumen de deudas"
        className="grid grid-cols-3 divide-x rounded-xl border bg-card shadow-xs"
      >
        <div className="px-3 py-2.5 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Total (PEN)
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">
            {formatCurrency(summary.totalPen, "PEN")}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {summary.byCurrency.USD > 0
              ? `US$ ${summary.byCurrency.USD.toFixed(2)} + S/ ${summary.byCurrency.PEN.toFixed(2)}`
              : "Equivalente en soles"}
          </p>
        </div>
        <div className="px-3 py-2.5 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Vencidas
          </p>
          <p
            className={cn(
              "mt-0.5 text-base font-semibold tabular-nums",
              summary.overdueCount > 0 && "text-destructive",
            )}
          >
            {summary.overdueCount}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {summary.openCount + summary.partialCount} abiertas
          </p>
        </div>
        <div className="px-3 py-2.5 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Próximo vencimiento
          </p>
          <p className="mt-0.5 text-sm font-semibold">
            {summary.nextDueDate ? formatDate(summary.nextDueDate) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Tasa USD→PEN {preferences.usdToPenRate.toFixed(2)}
          </p>
        </div>
      </section>

      {summary.alerts.overdue && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden
          />
          <p className="text-muted-foreground">
            Tienes deudas vencidas. Revisa los pagos para evitar recargos.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <nav
          aria-label="Filtrar deudas por estado"
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {STATUS_FILTERS.map((item) => {
            const active = status === item.value;
            return (
              <Link
                key={item.value}
                href={hrefFor({ status: item.value, currency })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 shrink-0 items-center rounded-full border px-3.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground active:bg-muted",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <nav
          aria-label="Filtrar deudas por moneda"
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CURRENCY_FILTERS.map((item) => {
            const active = currency === item.value;
            return (
              <Link
                key={item.value}
                href={hrefFor({ status, currency: item.value })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 shrink-0 items-center rounded-full border px-3.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground active:bg-muted",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {debts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={
            status === "all" && currency === "all"
              ? "Todavía no hay deudas"
              : "No hay deudas con estos filtros"
          }
          description={
            bankrolls.length === 0
              ? "Primero crea un bankroll para poder registrar un préstamo."
              : "Registra un préstamo para sumarlo al bankroll y llevar el control de pagos."
          }
          action={
            bankrolls.length === 0 ? (
              <Button asChild>
                <Link href="/bankroll">Crear bankroll</Link>
              </Button>
            ) : (
              <NewDebtSheet
                bankrolls={bankrolls}
                defaultCurrency={defaultCurrency}
                today={today}
                usdToPenRate={preferences.usdToPenRate}
                trigger={<Button type="button">Registrar deuda</Button>}
              />
            )
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {debts.map((debt) => (
            <DebtCard key={debt.id} debt={debt} />
          ))}
        </div>
      )}

      {bankrolls.length > 0 && debts.length > 0 && (
        <NewDebtSheet
          bankrolls={bankrolls}
          defaultCurrency={defaultCurrency}
          today={today}
          usdToPenRate={preferences.usdToPenRate}
          trigger={
            <button
              type="button"
              aria-label="Nueva deuda"
              className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95"
            >
              <Plus className="size-6" strokeWidth={2.4} aria-hidden />
            </button>
          }
        />
      )}
    </div>
  );
}
