import "server-only";

import type {
  BankrollTransactionType,
  DebtCurrency,
  DebtPaymentSource,
  DebtStatus,
} from "@prisma/client";

import { calculateBettingStats } from "@/lib/bet-math";
import {
  availableProfitForRepayment,
  bankrollFreeBalance,
  convertDebtToPen,
  debtRatio,
  getDebtSnapshot,
  loanFundedShare,
} from "@/lib/debt-math";
import { prisma } from "@/lib/prisma";
import { getUserPreferences } from "./user";

export type DebtFilter = {
  status?: DebtStatus | "all" | "overdue";
  currency?: DebtCurrency | "all";
};

export type DebtPaymentItem = {
  id: string;
  amount: number;
  paidAt: Date;
  source: DebtPaymentSource;
  exchangeRate: number | null;
  rateKind: "BUY" | "SELL" | null;
  rateLabel: string | null;
  note: string | null;
  voidedAt: Date | null;
  transactionId: string | null;
};

export type DebtItem = {
  id: string;
  lenderName: string;
  principal: number;
  currency: DebtCurrency;
  borrowedAt: Date;
  dueDate: Date | null;
  interestRateMonthly: number | null;
  exchangeRate: number | null;
  rateKind: "BUY" | "SELL" | null;
  rateLabel: string | null;
  status: DebtStatus;
  notes: string | null;
  bankrollId: string;
  bankrollName: string;
  bankrollCurrency: string;
  balance: number;
  interest: number;
  paid: number;
  isOverdue: boolean;
  progress: number;
  paymentsCount: number;
  equivalentPen: number;
  createdAt: Date;
};

export type DebtDetail = DebtItem & {
  payments: DebtPaymentItem[];
  availableProfit: number;
  freeBankrollBalance: number;
};

export type DebtSummary = {
  showDebts: boolean;
  usdToPenRate: number;
  thresholdPct: number;
  openCount: number;
  partialCount: number;
  paidCount: number;
  overdueCount: number;
  totalPen: number;
  byCurrency: Record<DebtCurrency, number>;
  ownCapitalPen: number;
  ratio: number;
  loanShare: number;
  nextDueDate: Date | null;
  alerts: {
    ratio: boolean;
    overdue: boolean;
    loanFunded: boolean;
  };
};

export type MovementItem = {
  id: string;
  type: BankrollTransactionType;
  amount: number;
  currency: DebtCurrency;
  exchangeRate: number | null;
  amountInBankrollCurrency: number;
  occurredAt: Date;
  note: string | null;
  bankrollId: string;
  bankrollName: string;
  bankrollCurrency: string;
  debtId: string | null;
  lenderName: string | null;
};

function amountToPen(
  amount: number,
  currency: string,
  usdToPenRate: number,
): number {
  // Para monedas fuera del alcance PEN/USD no hay tasa configurada; se
  // reportan 1:1 para no inventar una conversión.
  if (currency === "USD") return amount * usdToPenRate;
  return amount;
}

export async function getDebtsForUser(
  userId: string,
  filter: DebtFilter = {},
): Promise<{ debts: DebtItem[]; usdToPenRate: number }> {
  const preferences = await getUserPreferences(userId);
  const debts = await prisma.debt.findMany({
    where: {
      userId,
      ...(filter.currency && filter.currency !== "all"
        ? { currency: filter.currency }
        : {}),
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      bankroll: { select: { id: true, name: true, currency: true } },
      payments: {
        select: {
          id: true,
          amount: true,
          paidAt: true,
          source: true,
          exchangeRate: true,
          rateKind: true,
          rateLabel: true,
          note: true,
          voidedAt: true,
          transaction: { select: { id: true } },
        },
      },
      _count: { select: { payments: true } },
    },
  });

  const now = new Date();
  const items = debts.map((debt) => {
    const snapshot = getDebtSnapshot(debt, debt.payments, now);
    const total = debt.principal.toNumber() + snapshot.interest.toNumber();
    const paid = snapshot.paid.toNumber();
    const progress =
      snapshot.status === "PAID"
        ? 1
        : total > 0
          ? Math.min(1, Math.max(0, paid / total))
          : 0;
    const equivalentRate = debt.exchangeRate
      ? Number(debt.exchangeRate)
      : preferences.usdToPenRate;

    return {
      id: debt.id,
      lenderName: debt.lenderName,
      principal: debt.principal.toNumber(),
      currency: debt.currency,
      borrowedAt: debt.borrowedAt,
      dueDate: debt.dueDate,
      interestRateMonthly:
        debt.interestRateMonthly === null
          ? null
          : debt.interestRateMonthly.toNumber(),
      exchangeRate: debt.exchangeRate ? Number(debt.exchangeRate) : null,
      rateKind:
        debt.rateKind === "BUY" || debt.rateKind === "SELL"
          ? debt.rateKind
          : null,
      rateLabel: debt.rateLabel,
      status: snapshot.status,
      notes: debt.notes,
      bankrollId: debt.bankrollId,
      bankrollName: debt.bankroll.name,
      bankrollCurrency: debt.bankroll.currency,
      balance: snapshot.balance.toNumber(),
      interest: snapshot.interest.toNumber(),
      paid,
      isOverdue: snapshot.isOverdue,
      progress,
      paymentsCount: debt._count.payments,
      equivalentPen: convertDebtToPen(
        snapshot.balance,
        debt.currency,
        equivalentRate,
      ).toNumber(),
      createdAt: debt.createdAt,
    } satisfies DebtItem;
  });

  const filtered =
    filter.status === "overdue"
      ? items.filter((item) => item.isOverdue)
      : filter.status && filter.status !== "all"
        ? items.filter((item) => item.status === filter.status)
        : items;

  return { debts: filtered, usdToPenRate: preferences.usdToPenRate };
}

export async function getDebtForUser(
  userId: string,
  id: string,
): Promise<DebtDetail | null> {
  const preferences = await getUserPreferences(userId);
  const debt = await prisma.debt.findFirst({
    where: { id, userId },
    include: {
      bankroll: {
        select: {
          id: true,
          name: true,
          currency: true,
          initialAmount: true,
          bets: {
            select: {
              status: true,
              stake: true,
              odds: true,
              profit: true,
              isFreeBet: true,
            },
          },
          transactions: {
            select: {
              type: true,
              amountInBankrollCurrency: true,
            },
          },
        },
      },
      payments: {
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          amount: true,
          paidAt: true,
          source: true,
          exchangeRate: true,
          rateKind: true,
          rateLabel: true,
          note: true,
          voidedAt: true,
          transaction: { select: { id: true } },
        },
      },
      _count: { select: { payments: true } },
    },
  });

  if (!debt) return null;

  const now = new Date();
  const snapshot = getDebtSnapshot(debt, debt.payments, now);
  const total = debt.principal.toNumber() + snapshot.interest.toNumber();
  const paid = snapshot.paid.toNumber();
  const progress =
    snapshot.status === "PAID"
      ? 1
      : total > 0
        ? Math.min(1, Math.max(0, paid / total))
        : 0;

  const stats = calculateBettingStats(
    debt.bankroll.bets,
    debt.bankroll.initialAmount,
    debt.bankroll.transactions,
  );
  const availableProfit = availableProfitForRepayment({
    realizedProfit: stats.profit,
    transactions: debt.bankroll.transactions,
  }).toNumber();
  const freeBankrollBalance = bankrollFreeBalance({
    initialAmount: debt.bankroll.initialAmount,
    realizedProfit: stats.profit,
    transactions: debt.bankroll.transactions,
  }).toNumber();

  return {
    id: debt.id,
    lenderName: debt.lenderName,
    principal: debt.principal.toNumber(),
    currency: debt.currency,
    borrowedAt: debt.borrowedAt,
    dueDate: debt.dueDate,
    interestRateMonthly:
      debt.interestRateMonthly === null
        ? null
        : debt.interestRateMonthly.toNumber(),
    exchangeRate: debt.exchangeRate ? Number(debt.exchangeRate) : null,
    rateKind:
      debt.rateKind === "BUY" || debt.rateKind === "SELL"
        ? debt.rateKind
        : null,
    rateLabel: debt.rateLabel,
    status: snapshot.status,
    notes: debt.notes,
    bankrollId: debt.bankrollId,
    bankrollName: debt.bankroll.name,
    bankrollCurrency: debt.bankroll.currency,
    balance: snapshot.balance.toNumber(),
    interest: snapshot.interest.toNumber(),
    paid,
    isOverdue: snapshot.isOverdue,
    progress,
    paymentsCount: debt._count.payments,
    equivalentPen: convertDebtToPen(
      snapshot.balance,
      debt.currency,
      debt.exchangeRate
        ? Number(debt.exchangeRate)
        : preferences.usdToPenRate,
    ).toNumber(),
    createdAt: debt.createdAt,
    payments: debt.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount.toNumber(),
      paidAt: payment.paidAt,
      source: payment.source,
      exchangeRate:
        payment.exchangeRate === null ? null : payment.exchangeRate.toNumber(),
      rateKind:
        payment.rateKind === "BUY" || payment.rateKind === "SELL"
          ? payment.rateKind
          : null,
      rateLabel: payment.rateLabel,
      note: payment.note,
      voidedAt: payment.voidedAt,
      transactionId: payment.transaction?.id ?? null,
    })),
    availableProfit,
    freeBankrollBalance,
  };
}

export async function getDebtSummaryForUser(
  userId: string,
): Promise<DebtSummary> {
  const preferences = await getUserPreferences(userId);
  const [debts, bankrolls] = await Promise.all([
    prisma.debt.findMany({
      where: { userId },
      include: {
        payments: {
          select: { amount: true, paidAt: true, voidedAt: true },
        },
      },
    }),
    prisma.bankroll.findMany({
      where: { userId, isActive: true },
      select: {
        initialAmount: true,
        currency: true,
        bets: {
          select: {
            status: true,
            stake: true,
            odds: true,
            profit: true,
            isFreeBet: true,
          },
        },
        transactions: {
          select: { type: true, amountInBankrollCurrency: true },
        },
      },
    }),
  ]);

  const now = new Date();
  const openDebts = debts.map((debt) => ({
    debt,
    snapshot: getDebtSnapshot(debt, debt.payments, now),
  }));

  const byCurrency: Record<DebtCurrency, number> = { PEN: 0, USD: 0 };
  let totalPen = 0;
  let openCount = 0;
  let partialCount = 0;
  let paidCount = 0;
  let overdueCount = 0;
  let nextDueDate: Date | null = null;

  for (const item of openDebts) {
    const { debt, snapshot } = item;
    if (snapshot.status === "OPEN") openCount += 1;
    if (snapshot.status === "PARTIAL") partialCount += 1;
    if (snapshot.status === "PAID") {
      paidCount += 1;
      continue;
    }

    const balance = snapshot.balance.toNumber();
    byCurrency[debt.currency] += balance;
    totalPen += convertDebtToPen(
      snapshot.balance,
      debt.currency,
      debt.exchangeRate
        ? Number(debt.exchangeRate)
        : preferences.usdToPenRate,
    ).toNumber();
    if (snapshot.isOverdue) overdueCount += 1;
    if (debt.dueDate && debt.dueDate.getTime() >= now.getTime()) {
      if (!nextDueDate || debt.dueDate < nextDueDate) {
        nextDueDate = debt.dueDate;
      }
    }
  }

  const ownCapitalPen = bankrolls.reduce((total, bankroll) => {
    const stats = calculateBettingStats(
      bankroll.bets,
      bankroll.initialAmount,
      bankroll.transactions,
    );
    return (
      total +
      amountToPen(
        stats.ownCapital.toNumber(),
        bankroll.currency,
        preferences.usdToPenRate,
      )
    );
  }, 0);

  const ratio = debtRatio(totalPen, ownCapitalPen).toNumber();
  const loanShare = loanFundedShare(totalPen, ownCapitalPen).toNumber();
  const threshold = preferences.debtAlertThresholdPct / 100;

  return {
    showDebts: preferences.showDebts,
    usdToPenRate: preferences.usdToPenRate,
    thresholdPct: preferences.debtAlertThresholdPct,
    openCount,
    partialCount,
    paidCount,
    overdueCount,
    totalPen,
    byCurrency,
    ownCapitalPen,
    ratio,
    loanShare,
    nextDueDate,
    alerts: {
      ratio: totalPen > 0 && ratio > threshold,
      overdue: overdueCount > 0,
      loanFunded: totalPen > 0 && loanShare > 0.5,
    },
  };
}

export type OpenDebtSuggestion = {
  id: string;
  lenderName: string;
  currency: DebtCurrency;
  balance: number;
};

/** Primera deuda abierta, para la sugerencia tras ganar una apuesta. */
export async function getOpenDebtSuggestion(
  userId: string,
): Promise<OpenDebtSuggestion | null> {
  const debts = await prisma.debt.findMany({
    where: { userId, status: { not: "PAID" } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: {
      payments: { select: { amount: true, paidAt: true, voidedAt: true } },
    },
  });

  const now = new Date();
  for (const debt of debts) {
    const snapshot = getDebtSnapshot(debt, debt.payments, now);
    if (snapshot.status !== "PAID" && snapshot.balance.gt(0)) {
      return {
        id: debt.id,
        lenderName: debt.lenderName,
        currency: debt.currency,
        balance: snapshot.balance.toNumber(),
      };
    }
  }

  return null;
}

export async function getBankrollMovements(
  userId: string,
  filter: {
    bankrollId?: string;
    type?: BankrollTransactionType | "all";
  } = {},
): Promise<MovementItem[]> {
  const transactions = await prisma.bankrollTransaction.findMany({
    where: {
      userId,
      ...(filter.bankrollId ? { bankrollId: filter.bankrollId } : {}),
      ...(filter.type && filter.type !== "all" ? { type: filter.type } : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: 100,
    include: {
      bankroll: { select: { id: true, name: true, currency: true } },
      debt: { select: { lenderName: true } },
    },
  });

  return transactions.map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount.toNumber(),
    currency: transaction.currency,
    exchangeRate:
      transaction.exchangeRate === null
        ? null
        : transaction.exchangeRate.toNumber(),
    amountInBankrollCurrency:
      transaction.amountInBankrollCurrency.toNumber(),
    occurredAt: transaction.occurredAt,
    note: transaction.note,
    bankrollId: transaction.bankrollId,
    bankrollName: transaction.bankroll.name,
    bankrollCurrency: transaction.bankroll.currency,
    debtId: transaction.debtId,
    lenderName: transaction.debt?.lenderName ?? null,
  }));
}

