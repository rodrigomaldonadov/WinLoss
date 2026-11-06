import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  Landmark,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { BankrollCard } from "@/components/bankroll/bankroll-card";
import { BankrollMovementSheet } from "@/components/bankroll/bankroll-movement-sheet";
import { NewBankrollButton } from "@/components/bankroll/new-bankroll-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { getBankrollsForUser } from "@/lib/data/bankrolls";
import { getBankrollMovements } from "@/lib/data/debts";
import { getUserPreferences } from "@/lib/data/user";
import { toZonedDateTimeInput } from "@/lib/date";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { BankrollTransactionType } from "@prisma/client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Bankroll",
};

const MOVEMENT_FILTERS: {
  value: BankrollTransactionType | "all";
  label: string;
}[] = [
  { value: "all", label: "Todos" },
  { value: "DEPOSIT", label: "Depósitos" },
  { value: "WITHDRAWAL", label: "Retiros" },
  { value: "LOAN_IN", label: "Préstamos" },
  { value: "LOAN_REPAYMENT", label: "Pagos" },
];

const MOVEMENT_LABELS: Record<BankrollTransactionType, string> = {
  DEPOSIT: "Depósito",
  WITHDRAWAL: "Retiro",
  LOAN_IN: "Préstamo",
  LOAN_REPAYMENT: "Pago de deuda",
};

const MOVEMENT_ICONS = {
  DEPOSIT: ArrowDownToLine,
  WITHDRAWAL: ArrowUpFromLine,
  LOAN_IN: Landmark,
  LOAN_REPAYMENT: ReceiptText,
} as const;

type BankrollPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseMovementFilter(
  value?: string | string[],
): BankrollTransactionType | "all" {
  const raw = firstParam(value);
  return raw === "DEPOSIT" ||
    raw === "WITHDRAWAL" ||
    raw === "LOAN_IN" ||
    raw === "LOAN_REPAYMENT"
    ? raw
    : "all";
}

function movementHref(type: BankrollTransactionType | "all"): string {
  return type === "all" ? "/bankroll" : `/bankroll?mov=${type}`;
}

export default async function BankrollPage({
  searchParams,
}: BankrollPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const movementFilter = parseMovementFilter(params.mov);

  const [bankrolls, preferences, movements] = await Promise.all([
    getBankrollsForUser(session.user.id),
    getUserPreferences(session.user.id),
    getBankrollMovements(session.user.id, {
      type: movementFilter,
    }),
  ]);

  const today = toZonedDateTimeInput(
    new Date(),
    preferences.timezone,
  ).slice(0, 10);
  const bankrollOptions = bankrolls.map((item) => ({
    id: item.id,
    name: item.name,
    currency: item.currency,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bankroll"
        description={
          bankrolls.length === 0
            ? "Tu capital y su evolución."
            : `${bankrolls.length} bankroll${bankrolls.length === 1 ? "" : "s"}`
        }
        action={<NewBankrollButton />}
      />

      {bankrolls.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Crea tu primer bankroll"
          description="Separa el capital que vas a dedicar a apostar. A partir de ahí mediremos tu ROI, yield y evolución."
          action={<NewBankrollButton label="Crear mi bankroll" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {bankrolls.map((bankroll) => (
            <BankrollCard key={bankroll.id} bankroll={bankroll} />
          ))}
        </div>
      )}

      {bankrolls.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Movimientos</h2>
              <p className="text-xs text-muted-foreground">
                Depósitos, retiros, préstamos y pagos
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                asChild
                variant="outline"
                size="icon"
                aria-label="Exportar movimientos"
              >
                <a href="/api/export/movements" download>
                  <Download className="size-4" aria-hidden />
                </a>
              </Button>
              <BankrollMovementSheet
                bankrolls={bankrollOptions}
                today={today}
                usdToPenRate={preferences.usdToPenRate}
                trigger={
                  <Button type="button" variant="outline" className="h-10">
                    Registrar
                  </Button>
                }
              />
            </div>
          </div>

          <nav
            aria-label="Filtrar movimientos"
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {MOVEMENT_FILTERS.map((item) => {
              const active = movementFilter === item.value;
              return (
                <Link
                  key={item.value}
                  href={movementHref(item.value)}
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

          {movements.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
              <ReceiptText
                className="mx-auto size-7 text-muted-foreground"
                aria-hidden
              />
              <p className="mt-2 text-sm font-medium">
                Sin movimientos en este filtro
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Los depósitos, retiros y préstamos aparecerán aquí.
              </p>
            </div>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {movements.map((movement) => {
                const Icon = MOVEMENT_ICONS[movement.type];
                const positive =
                  movement.type === "DEPOSIT" ||
                  movement.type === "LOAN_IN";
                return (
                  <li
                    key={movement.id}
                    className="flex items-start gap-3 p-3"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        positive
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">
                        {MOVEMENT_LABELS[movement.type]}
                        {movement.lenderName
                          ? ` · ${movement.lenderName}`
                          : ""}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateTime(
                          movement.occurredAt,
                          preferences.timezone,
                        )}{" "}
                        · {movement.bankrollName}
                        {movement.currency !== movement.bankrollCurrency
                          ? ` · ${formatCurrency(movement.amount, movement.currency)} @ ${movement.exchangeRate}`
                          : ""}
                      </p>
                      {movement.note && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {movement.note}
                        </p>
                      )}
                    </div>
                    <p
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        positive ? "text-success" : "text-foreground",
                      )}
                    >
                      {formatCurrency(
                        movement.amountInBankrollCurrency,
                        movement.bankrollCurrency,
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-xl border border-dashed bg-muted/30 p-5">
        <div className="flex size-11 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs ring-1 ring-border">
          <Wallet className="size-5" strokeWidth={1.8} aria-hidden />
        </div>
        <h2 className="mt-3 text-base font-semibold">
          ¿Por qué separar el bankroll?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Un bankroll es el dinero que apartas exclusivamente para apostar.
          Tenerlo aislado te ayuda a medir tu rentabilidad real y a controlar el
          riesgo.
        </p>
      </section>
    </div>
  );
}
