"use server";

import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { calculateBettingStats } from "@/lib/bet-math";
import {
  balanceBeforePayment,
  bankrollFreeBalance,
  convertToBankrollCurrency,
  deriveDebtStatus,
  resolveExchangeRate,
  signedAmountForTransaction,
  type DebtPaymentForMath,
} from "@/lib/debt-math";
import { getUserPreferences } from "@/lib/data/user";
import { prisma } from "@/lib/prisma";
import { zonedDateTimeToUtc } from "@/lib/date";
import {
  bankrollMovementSchema,
  createDebtSchema,
  debtPaymentSchema,
  deleteDebtSchema,
  updateDebtSchema,
  voidPaymentSchema,
} from "@/lib/validations/debt";

export type DebtActionState = {
  ok?: boolean;
  id?: string;
  paymentId?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type SimpleDebtState = {
  ok?: boolean;
  error?: string;
};

type PaymentTransactionResult =
  | {
      ok: false;
      error?: string;
      fieldErrors?: Record<string, string[]>;
    }
  | {
      ok: true;
      id: string;
      converted: number;
      debtCurrency: "PEN" | "USD";
      bankrollCurrency: string;
      rate: number | null;
      fromBankroll: boolean;
      paymentId: string;
      amount: number;
    };

const BET_SELECT = {
  status: true,
  stake: true,
  odds: true,
  profit: true,
  isFreeBet: true,
};

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

function localDateToUtc(value: string, timeZone: string): Date {
  return zonedDateTimeToUtc(`${value}T12:00`, timeZone);
}

function revalidateDebtViews(debtId?: string) {
  for (const path of [
    "/debts",
    "/bankroll",
    "/bets/new",
    "/",
    "/settings",
  ]) {
    revalidatePath(path);
  }
  if (debtId) revalidatePath(`/debts/${debtId}`);
}

async function syncUsdPenRate({
  userId,
  amountCurrency,
  bankrollCurrency,
  rate,
}: {
  userId: string;
  amountCurrency: "PEN" | "USD";
  bankrollCurrency: string;
  rate: Decimal;
}) {
  let usdToPen: Decimal | null = null;
  if (amountCurrency === "USD" && bankrollCurrency === "PEN") {
    usdToPen = rate;
  } else if (amountCurrency === "PEN" && bankrollCurrency === "USD") {
    usdToPen = new Decimal(1).div(rate);
  }
  if (!usdToPen) return;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { usdToPenRate: usdToPen },
    });
  } catch {
    // La tasa es una sugerencia; no debe tumbar la operación principal.
  }
}

export async function createDebt(
  _prevState: DebtActionState,
  formData: FormData,
): Promise<DebtActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Tu sesión ha caducado." };

  const parsed = createDebtSchema.safeParse({
    bankrollId: formData.get("bankrollId"),
    lenderName: formData.get("lenderName"),
    principal: formData.get("principal"),
    currency: formData.get("currency"),
    borrowedAt: formData.get("borrowedAt"),
    dueDate: formData.get("dueDate"),
    interestRateMonthly: formData.get("interestRateMonthly"),
    addToBankroll: formData.get("addToBankroll"),
    exchangeRate: formData.get("exchangeRate"),
    rateId: formData.get("rateId"),
    rateKind: formData.get("rateKind"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const data = parsed.data;
  const preferences = await getUserPreferences(session.user.id);

  const bankroll = await prisma.bankroll.findFirst({
    where: {
      id: data.bankrollId,
      userId: session.user.id,
      isActive: true,
    },
    select: { id: true, currency: true, name: true },
  });

  if (!bankroll) {
    return {
      fieldErrors: { bankrollId: ["Selecciona un bankroll válido."] },
    };
  }

  const rate = resolveExchangeRate({
    amountCurrency: data.currency,
    bankrollCurrency: bankroll.currency,
    exchangeRate: data.exchangeRate,
  });

  if (!rate) {
    return {
      fieldErrors: {
        exchangeRate: [
          "Indica la tasa de cambio entre la deuda y el bankroll.",
        ],
      },
    };
  }

  let savedRate: { rate: Decimal; kind: "BUY" | "SELL"; label: string } | null =
    null;
  if (data.rateId) {
    if (!(data.currency === "USD" && bankroll.currency === "PEN")) {
      return {
        fieldErrors: {
          exchangeRate: [
            "La tasa guardada solo aplica a deudas en USD desde un bankroll en PEN.",
          ],
        },
      };
    }
    const entry = await prisma.exchangeRate.findFirst({
      where: { id: data.rateId, userId: session.user.id },
      select: { buyRate: true, sellRate: true, label: true },
    });
    if (!entry) {
      return {
        fieldErrors: {
          exchangeRate: ["La tasa seleccionada ya no está disponible."],
        },
      };
    }
    const kind = data.rateKind ?? "BUY";
    savedRate = {
      rate: new Decimal(kind === "BUY" ? entry.buyRate : entry.sellRate),
      kind,
      label: entry.label,
    };
  }

  const appliedRate = savedRate?.rate ?? rate;

  const principal = new Decimal(data.principal);
  const borrowedAt = localDateToUtc(data.borrowedAt, preferences.timezone);
  const dueDate = data.dueDate
    ? localDateToUtc(data.dueDate, preferences.timezone)
    : null;

  const debt = await prisma.$transaction(async (tx) => {
    const created = await tx.debt.create({
      data: {
        userId: session.user.id,
        bankrollId: bankroll.id,
        lenderName: data.lenderName,
        principal,
        currency: data.currency,
        borrowedAt,
        dueDate,
        interestRateMonthly: data.interestRateMonthly ?? null,
        exchangeRate: appliedRate,
        rateKind: savedRate?.kind ?? null,
        rateLabel: savedRate?.label ?? null,
        status: "OPEN",
        notes: data.notes ?? null,
      },
      select: { id: true },
    });

    if (data.addToBankroll) {
      await tx.bankrollTransaction.create({
        data: {
          userId: session.user.id,
          bankrollId: bankroll.id,
          type: "LOAN_IN",
          amount: principal,
          currency: data.currency,
          exchangeRate: appliedRate,
          amountInBankrollCurrency: convertToBankrollCurrency(
            principal,
            appliedRate,
          ),
          occurredAt: borrowedAt,
          debtId: created.id,
          note: `Préstamo de ${data.lenderName}`,
        },
      });
    }

    return created;
  });

  if (data.addToBankroll) {
    await syncUsdPenRate({
      userId: session.user.id,
      amountCurrency: data.currency,
      bankrollCurrency: bankroll.currency,
      rate: appliedRate,
    });
  }

  revalidateDebtViews(debt.id);
  return { ok: true, id: debt.id };
}

export async function updateDebt(
  _prevState: DebtActionState,
  formData: FormData,
): Promise<DebtActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Tu sesión ha caducado." };

  const parsed = updateDebtSchema.safeParse({
    id: formData.get("id"),
    lenderName: formData.get("lenderName"),
    dueDate: formData.get("dueDate"),
    interestRateMonthly: formData.get("interestRateMonthly"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const data = parsed.data;
  const preferences = await getUserPreferences(session.user.id);
  const dueDate = data.dueDate
    ? localDateToUtc(data.dueDate, preferences.timezone)
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.debt.findFirst({
      where: { id: data.id, userId: session.user.id },
      include: {
        payments: {
          select: { amount: true, paidAt: true, voidedAt: true },
        },
      },
    });
    if (!existing) return null;

    const status = deriveDebtStatus(
      {
        ...existing,
        interestRateMonthly:
          data.interestRateMonthly ?? existing.interestRateMonthly,
      },
      existing.payments,
      new Date(),
    );

    return tx.debt.update({
      where: { id: existing.id },
      data: {
        lenderName: data.lenderName,
        dueDate,
        interestRateMonthly: data.interestRateMonthly ?? null,
        notes: data.notes ?? null,
        status,
      },
      select: { id: true },
    });
  });

  if (!updated) return { error: "Deuda no encontrada." };

  revalidateDebtViews(updated.id);
  return { ok: true, id: updated.id };
}

export async function registerPayment(
  _prevState: DebtActionState,
  formData: FormData,
): Promise<DebtActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Tu sesión ha caducado." };

  const parsed = debtPaymentSchema.safeParse({
    debtId: formData.get("debtId"),
    amount: formData.get("amount"),
    paidAt: formData.get("paidAt"),
    source: formData.get("source"),
    exchangeRate: formData.get("exchangeRate"),
    rateId: formData.get("rateId"),
    rateKind: formData.get("rateKind"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const data = parsed.data;
  const preferences = await getUserPreferences(session.user.id);
  const amount = new Decimal(data.amount);
  const paidAt = localDateToUtc(data.paidAt, preferences.timezone);

  const result: PaymentTransactionResult = await prisma.$transaction(
    async (tx): Promise<PaymentTransactionResult> => {
      const debt = await tx.debt.findFirst({
        where: { id: data.debtId, userId: session.user.id },
        include: {
          bankroll: { select: { id: true, currency: true, name: true } },
          payments: {
            orderBy: { paidAt: "asc" },
            select: { amount: true, paidAt: true, voidedAt: true },
          },
        },
      });

      if (!debt) return { ok: false, error: "Deuda no encontrada." };
      if (debt.status === "PAID") {
        return { ok: false, error: "Esta deuda ya está pagada." };
      }

      const pending = balanceBeforePayment(
        debt,
        debt.payments,
        paidAt,
      );
      if (amount.gt(pending)) {
        return {
          ok: false,
          fieldErrors: {
            amount: [
              `El pago supera el saldo pendiente (${pending.toFixed(2)} ${debt.currency}).`,
            ],
          },
        };
      }

      let savedRate: {
        rate: Decimal;
        kind: "BUY" | "SELL";
        label: string;
      } | null = null;

      if (
        data.source === "FROM_BANKROLL" &&
        data.rateId &&
        debt.currency === "USD" &&
        debt.bankroll.currency === "PEN"
      ) {
        const entry = await tx.exchangeRate.findFirst({
          where: { id: data.rateId, userId: session.user.id },
          select: { buyRate: true, sellRate: true, label: true },
        });

        if (!entry) {
          return {
            ok: false,
            fieldErrors: {
              exchangeRate: ["La tasa seleccionada ya no está disponible."],
            },
          };
        }

        const kind = data.rateKind ?? "SELL";
        savedRate = {
          rate: new Decimal(kind === "BUY" ? entry.buyRate : entry.sellRate),
          kind,
          label: entry.label,
        };
      }

      const rate =
        data.source === "FROM_BANKROLL"
          ? (savedRate?.rate ??
            resolveExchangeRate({
              amountCurrency: debt.currency,
              bankrollCurrency: debt.bankroll.currency,
              exchangeRate: data.exchangeRate,
            }))
          : data.exchangeRate !== undefined
            ? new Decimal(data.exchangeRate)
            : null;

      if (data.source === "FROM_BANKROLL" && !rate) {
        return {
          ok: false,
          fieldErrors: {
            exchangeRate: ["Indica la tasa de cambio para el pago."],
          },
        };
      }

      let converted = new Decimal(0);
      if (data.source === "FROM_BANKROLL" && rate) {
        converted = convertToBankrollCurrency(amount, rate);
        const bankroll = await tx.bankroll.findFirst({
          where: { id: debt.bankrollId, userId: session.user.id },
          include: {
            bets: { select: BET_SELECT },
            transactions: {
              select: {
                type: true,
                amountInBankrollCurrency: true,
              },
            },
          },
        });

        if (!bankroll) {
          return {
            ok: false,
            error: "El bankroll de la deuda no existe.",
          };
        }

        const stats = calculateBettingStats(
          bankroll.bets,
          bankroll.initialAmount,
          bankroll.transactions,
        );
        const free = bankrollFreeBalance({
          initialAmount: bankroll.initialAmount,
          realizedProfit: stats.profit,
          transactions: bankroll.transactions,
        });

        if (converted.gt(free)) {
          return {
            ok: false,
            fieldErrors: {
              amount: [
                `El saldo libre del bankroll no alcanza (${free.toFixed(2)} ${bankroll.currency}).`,
              ],
            },
          };
        }
      }

      const payment = await tx.debtPayment.create({
        data: {
          debtId: debt.id,
          amount,
          paidAt,
          source: data.source,
          exchangeRate: rate,
          rateKind: savedRate?.kind ?? null,
          rateLabel: savedRate?.label ?? null,
          note: data.note ?? null,
        },
        select: { id: true },
      });

      if (data.source === "FROM_BANKROLL" && rate) {
        await tx.bankrollTransaction.create({
          data: {
            userId: session.user.id,
            bankrollId: debt.bankrollId,
            type: "LOAN_REPAYMENT",
            amount,
            currency: debt.currency,
            exchangeRate: rate,
            amountInBankrollCurrency: converted.negated(),
            occurredAt: paidAt,
            debtId: debt.id,
            debtPaymentId: payment.id,
            note: `Pago a ${debt.lenderName}`,
          },
        });
      }

      const nextPayments: DebtPaymentForMath[] = [
        ...debt.payments,
        { amount, paidAt, voidedAt: null },
      ];
      const status = deriveDebtStatus(debt, nextPayments, new Date());
      await tx.debt.update({
        where: { id: debt.id },
        data: { status },
      });

      return {
        ok: true,
        id: debt.id,
        converted: converted.toNumber(),
        debtCurrency: debt.currency,
        bankrollCurrency: debt.bankroll.currency,
        rate: rate?.toNumber() ?? null,
        fromBankroll: data.source === "FROM_BANKROLL",
        paymentId: payment.id,
        amount: amount.toNumber(),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (!result.ok) return result;

  if (result.fromBankroll && result.rate) {
    await syncUsdPenRate({
      userId: session.user.id,
      amountCurrency: result.debtCurrency,
      bankrollCurrency: result.bankrollCurrency,
      rate: new Decimal(result.rate),
    });
  }

  revalidateDebtViews(result.id);
  return { ok: true, id: result.id, paymentId: result.paymentId };
}

export async function voidPayment(
  paymentId: string,
): Promise<SimpleDebtState> {
  const session = await auth();
  if (!session?.user) return { error: "Tu sesión ha caducado." };

  const parsed = voidPaymentSchema.safeParse({ paymentId });
  if (!parsed.success) return { error: "Pago inválido." };

  const payment = await prisma.debtPayment.findFirst({
    where: {
      id: parsed.data.paymentId,
      debt: { userId: session.user.id },
    },
    include: {
      debt: {
        include: {
          payments: {
            select: {
              id: true,
              amount: true,
              paidAt: true,
              voidedAt: true,
            },
          },
        },
      },
    },
  });

  if (!payment) return { error: "Pago no encontrado." };
  if (payment.voidedAt) return { ok: true };

  const debtId = payment.debtId;

  await prisma.$transaction(async (tx) => {
    await tx.debtPayment.update({
      where: { id: payment.id },
      data: { voidedAt: new Date() },
    });
    await tx.bankrollTransaction.deleteMany({
      where: { debtPaymentId: payment.id },
    });

    const remaining = payment.debt.payments.filter(
      (item) => item.id !== payment.id && !item.voidedAt,
    );
    const status = deriveDebtStatus(
      payment.debt,
      remaining,
      new Date(),
    );
    await tx.debt.update({
      where: { id: debtId },
      data: { status },
    });
  });

  revalidateDebtViews(debtId);
  return { ok: true };
}

export async function deleteDebt(
  debtId: string,
): Promise<SimpleDebtState> {
  const session = await auth();
  if (!session?.user) return { error: "Tu sesión ha caducado." };

  const parsed = deleteDebtSchema.safeParse({ id: debtId });
  if (!parsed.success) return { error: "Deuda inválida." };

  const debt = await prisma.debt.findFirst({
    where: { id: parsed.data.id, userId: session.user.id },
    select: { id: true, _count: { select: { payments: true } } },
  });

  if (!debt) return { error: "Deuda no encontrada." };
  if (debt._count.payments > 0) {
    return {
      error:
        "No puedes eliminar una deuda con pagos. Anula los pagos o consérvala como historial.",
    };
  }

  await prisma.$transaction([
    prisma.bankrollTransaction.deleteMany({ where: { debtId: debt.id } }),
    prisma.debt.delete({ where: { id: debt.id } }),
  ]);

  revalidateDebtViews();
  return { ok: true };
}

export async function createBankrollMovement(
  _prevState: DebtActionState,
  formData: FormData,
): Promise<DebtActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Tu sesión ha caducado." };

  const parsed = bankrollMovementSchema.safeParse({
    bankrollId: formData.get("bankrollId"),
    type: formData.get("type"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    occurredAt: formData.get("occurredAt"),
    exchangeRate: formData.get("exchangeRate"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const data = parsed.data;
  const preferences = await getUserPreferences(session.user.id);
  const bankroll = await prisma.bankroll.findFirst({
    where: {
      id: data.bankrollId,
      userId: session.user.id,
      isActive: true,
    },
    include: {
      bets: { select: BET_SELECT },
      transactions: {
        select: {
          type: true,
          amountInBankrollCurrency: true,
        },
      },
    },
  });

  if (!bankroll) {
    return {
      fieldErrors: { bankrollId: ["Selecciona un bankroll válido."] },
    };
  }

  const rate = resolveExchangeRate({
    amountCurrency: data.currency,
    bankrollCurrency: bankroll.currency,
    exchangeRate: data.exchangeRate,
  });

  if (!rate) {
    return {
      fieldErrors: {
        exchangeRate: ["Indica la tasa de cambio del movimiento."],
      },
    };
  }

  const amount = new Decimal(data.amount);
  const converted = convertToBankrollCurrency(amount, rate);
  const signed = signedAmountForTransaction(data.type, converted);

  if (data.type === "WITHDRAWAL") {
    const stats = calculateBettingStats(
      bankroll.bets,
      bankroll.initialAmount,
      bankroll.transactions,
    );
    if (converted.gt(stats.currentBankroll)) {
      return {
        fieldErrors: {
          amount: [
            `El retiro supera el saldo disponible (${stats.currentBankroll.toFixed(2)} ${bankroll.currency}).`,
          ],
        },
      };
    }
  }

  const occurredAt = localDateToUtc(data.occurredAt, preferences.timezone);

  const transaction = await prisma.bankrollTransaction.create({
    data: {
      userId: session.user.id,
      bankrollId: bankroll.id,
      type: data.type,
      amount,
      currency: data.currency,
      exchangeRate: rate,
      amountInBankrollCurrency: signed,
      occurredAt,
      note: data.note ?? null,
    },
    select: { id: true },
  });

  await syncUsdPenRate({
    userId: session.user.id,
    amountCurrency: data.currency,
    bankrollCurrency: bankroll.currency,
    rate,
  });

  revalidateDebtViews();
  return { ok: true, id: transaction.id };
}
