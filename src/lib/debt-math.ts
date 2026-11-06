import type {
  BankrollTransactionType,
  DebtCurrency,
  DebtStatus,
} from "@prisma/client";
import Decimal from "decimal.js";

import { roundMoney, toDecimal, type Numeric } from "@/lib/bet-math";

export const DEBT_DAY_MS = 24 * 60 * 60 * 1000;
/** Mes financiero simple usado para prorratear el interés. */
export const DEBT_DAYS_PER_MONTH = 30;

export type DebtForMath = {
  principal: Numeric;
  currency: DebtCurrency;
  borrowedAt: Date;
  dueDate?: Date | null;
  interestRateMonthly?: Numeric | null;
  status?: DebtStatus;
};

export type DebtPaymentForMath = {
  amount: Numeric;
  paidAt: Date;
  voidedAt?: Date | null;
};

export type BankrollMovementForMath = {
  type: BankrollTransactionType;
  amountInBankrollCurrency: Numeric;
};

export type DebtSnapshot = {
  status: DebtStatus;
  /** Saldo pendiente en la moneda de la deuda. */
  balance: Decimal;
  /** Interés devengado hasta `asOf`. */
  interest: Decimal;
  /** Pagos válidos acumulados hasta `asOf`. */
  paid: Decimal;
  isOverdue: boolean;
};

function nonVoidedPayments(
  payments: DebtPaymentForMath[],
  asOf?: Date,
): DebtPaymentForMath[] {
  return payments.filter(
    (payment) =>
      !payment.voidedAt &&
      (!asOf || payment.paidAt.getTime() <= asOf.getTime()),
  );
}

function sumPayments(payments: DebtPaymentForMath[]): Decimal {
  return payments.reduce(
    (total, payment) => total.plus(toDecimal(payment.amount)),
    new Decimal(0),
  );
}

function daysBetween(from: Date, to: Date): Decimal {
  const diff = to.getTime() - from.getTime();
  if (diff <= 0) return new Decimal(0);
  return new Decimal(diff).div(DEBT_DAY_MS);
}

/**
 * Interés simple: principal × tasa mensual × meses transcurridos.
 * Se prorratea por días con un mes de 30 días. Sin tasa, no hay interés.
 */
export function accruedInterest(
  debt: Pick<
    DebtForMath,
    "principal" | "borrowedAt" | "interestRateMonthly"
  >,
  asOf: Date = new Date(),
): Decimal {
  const rate = toDecimal(debt.interestRateMonthly ?? 0);
  if (rate.lte(0)) return new Decimal(0);

  const months = daysBetween(debt.borrowedAt, asOf).div(
    DEBT_DAYS_PER_MONTH,
  );
  const interest = toDecimal(debt.principal)
    .mul(rate.div(100))
    .mul(months);

  return roundMoney(interest);
}

/**
 * Estado derivado. Para saber si está pagada se congela el interés en la
 * fecha del último pago: una deuda saldada no debe seguir generando intereses.
 */
export function deriveDebtStatus(
  debt: DebtForMath,
  payments: DebtPaymentForMath[],
  asOf: Date = new Date(),
): DebtStatus {
  const valid = nonVoidedPayments(payments, asOf);
  if (valid.length === 0) return "OPEN";

  const lastPayment = valid.reduce(
    (latest, payment) =>
      payment.paidAt.getTime() > latest.getTime() ? payment.paidAt : latest,
    valid[0]!.paidAt,
  );
  const paid = sumPayments(valid);
  const interestAtLastPayment = accruedInterest(debt, lastPayment);
  const coveredAtLastPayment = toDecimal(debt.principal)
    .plus(interestAtLastPayment)
    .minus(paid);

  return coveredAtLastPayment.lte(0) ? "PAID" : "PARTIAL";
}

export function isDebtOverdue(
  debt: Pick<DebtForMath, "dueDate">,
  status: DebtStatus,
  asOf: Date = new Date(),
): boolean {
  return Boolean(
    debt.dueDate &&
      debt.dueDate.getTime() < asOf.getTime() &&
      status !== "PAID",
  );
}

/** Saldo pendiente y datos derivados en la moneda de la deuda. */
export function getDebtSnapshot(
  debt: DebtForMath,
  payments: DebtPaymentForMath[],
  asOf: Date = new Date(),
): DebtSnapshot {
  const status = deriveDebtStatus(debt, payments, asOf);
  const valid = nonVoidedPayments(payments, asOf);
  const paid = sumPayments(valid);

  if (status === "PAID") {
    return {
      status,
      balance: new Decimal(0),
      interest: new Decimal(0),
      paid,
      isOverdue: false,
    };
  }

  const interest = accruedInterest(debt, asOf);
  const balance = Decimal.max(
    0,
    toDecimal(debt.principal).plus(interest).minus(paid),
  );

  return {
    status,
    balance: roundMoney(balance),
    interest,
    paid,
    isOverdue: isDebtOverdue(debt, status, asOf),
  };
}

/** Saldo que había justo antes de un pago en una fecha concreta. */
export function balanceBeforePayment(
  debt: DebtForMath,
  payments: DebtPaymentForMath[],
  paidAt: Date,
): Decimal {
  return getDebtSnapshot(debt, payments, paidAt).balance;
}

/** true si el pago no supera el saldo pendiente a esa fecha. */
export function canPayAmount(
  debt: DebtForMath,
  payments: DebtPaymentForMath[],
  amount: Numeric,
  paidAt: Date,
): boolean {
  const value = toDecimal(amount);
  return value.gt(0) && value.lte(balanceBeforePayment(debt, payments, paidAt));
}

/**
 * Unidades de moneda del bankroll por 1 unidad de la moneda original.
 * Si son la misma moneda, la tasa es 1; si no, se exige una tasa positiva.
 */
export function resolveExchangeRate({
  amountCurrency,
  bankrollCurrency,
  exchangeRate,
}: {
  amountCurrency: DebtCurrency;
  bankrollCurrency: string;
  exchangeRate?: Numeric | null;
}): Decimal | null {
  if (amountCurrency === bankrollCurrency) return new Decimal(1);
  if (
    exchangeRate === null ||
    exchangeRate === undefined ||
    String(exchangeRate).trim() === ""
  ) {
    return null;
  }
  const rate = toDecimal(exchangeRate);
  return rate.gt(0) ? rate : null;
}

export function convertToBankrollCurrency(
  amount: Numeric,
  rate: Numeric,
): Decimal {
  return roundMoney(toDecimal(amount).mul(toDecimal(rate)));
}

/** Los movimientos guardan el convertido con signo; el tipo da la dirección. */
export function signedAmountForTransaction(
  type: BankrollTransactionType,
  amountInBankrollCurrency: Numeric,
): Decimal {
  const value = toDecimal(amountInBankrollCurrency).abs();
  return type === "DEPOSIT" || type === "LOAN_IN"
    ? value
    : value.negated();
}

export function bankrollBalanceWithMovements(
  initialAmount: Numeric,
  transactions: BankrollMovementForMath[],
): Decimal {
  return roundMoney(
    transactions.reduce(
      (total, transaction) =>
        total.plus(toDecimal(transaction.amountInBankrollCurrency)),
      toDecimal(initialAmount),
    ),
  );
}

/**
 * Capital aportado: inicial + depósitos + préstamos − retiros.
 * Los pagos de deuda no lo reducen; son devolución de capital prestado.
 */
export function calculateCapitalContributed(
  initialAmount: Numeric,
  transactions: BankrollMovementForMath[],
): Decimal {
  const eligible = transactions.filter(
    (transaction) =>
      transaction.type === "DEPOSIT" ||
      transaction.type === "WITHDRAWAL" ||
      transaction.type === "LOAN_IN",
  );
  return roundMoney(
    eligible.reduce(
      (total, transaction) =>
        total.plus(toDecimal(transaction.amountInBankrollCurrency)),
      toDecimal(initialAmount),
    ),
  );
}

/** Capital propio: inicial + depósitos − retiros (sin préstamos). */
export function calculateOwnCapital(
  initialAmount: Numeric,
  transactions: BankrollMovementForMath[],
): Decimal {
  const eligible = transactions.filter(
    (transaction) =>
      transaction.type === "DEPOSIT" || transaction.type === "WITHDRAWAL",
  );
  return roundMoney(
    eligible.reduce(
      (total, transaction) =>
        total.plus(toDecimal(transaction.amountInBankrollCurrency)),
      toDecimal(initialAmount),
    ),
  );
}

/** Ganancia realizada menos la parte ya pagada desde el bankroll. */
export function availableProfitForRepayment({
  realizedProfit,
  transactions,
}: {
  realizedProfit: Numeric;
  transactions: BankrollMovementForMath[];
}): Decimal {
  const repaid = transactions
    .filter((transaction) => transaction.type === "LOAN_REPAYMENT")
    .reduce(
      (total, transaction) =>
        total.plus(toDecimal(transaction.amountInBankrollCurrency).abs()),
      new Decimal(0),
    );

  return roundMoney(Decimal.max(0, toDecimal(realizedProfit).minus(repaid)));
}

/** Saldo libre sin reservar los stakes pendientes (regla de pago de deuda). */
export function bankrollFreeBalance({
  initialAmount,
  realizedProfit,
  transactions,
}: {
  initialAmount: Numeric;
  realizedProfit: Numeric;
  transactions: BankrollMovementForMath[];
}): Decimal {
  return roundMoney(
    bankrollBalanceWithMovements(initialAmount, transactions).plus(
      toDecimal(realizedProfit),
    ),
  );
}

export function convertDebtToPen(
  amount: Numeric,
  currency: DebtCurrency,
  usdToPenRate: Numeric,
): Decimal {
  return currency === "PEN"
    ? roundMoney(amount)
    : roundMoney(toDecimal(amount).mul(toDecimal(usdToPenRate)));
}

export function debtRatio(
  debtInPen: Numeric,
  ownCapitalInPen: Numeric,
): Decimal {
  const capital = toDecimal(ownCapitalInPen);
  if (capital.lte(0)) return toDecimal(debtInPen).gt(0) ? new Decimal(1) : new Decimal(0);
  return toDecimal(debtInPen).div(capital).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function loanFundedShare(
  debtInPen: Numeric,
  ownCapitalInPen: Numeric,
): Decimal {
  const debt = toDecimal(debtInPen);
  const denominator = debt.plus(toDecimal(ownCapitalInPen));
  if (denominator.lte(0)) return new Decimal(0);
  return debt.div(denominator).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}
