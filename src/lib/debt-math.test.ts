import { describe, expect, it } from "vitest";

import {
  accruedInterest,
  availableProfitForRepayment,
  balanceBeforePayment,
  bankrollBalanceWithMovements,
  calculateCapitalContributed,
  calculateOwnCapital,
  canPayAmount,
  convertDebtToPen,
  convertToBankrollCurrency,
  debtRatio,
  deriveDebtStatus,
  getDebtSnapshot,
  isDebtOverdue,
  loanFundedShare,
  resolveExchangeRate,
  signedAmountForTransaction,
} from "./debt-math";

const JAN_1 = new Date("2026-01-01T00:00:00.000Z");
const JAN_31 = new Date("2026-01-31T00:00:00.000Z");
const FEB_1 = new Date("2026-02-01T00:00:00.000Z");
const FEB_28 = new Date("2026-02-28T00:00:00.000Z");

describe("interés simple", () => {
  it("no genera interés sin tasa", () => {
    expect(
      accruedInterest(
        { principal: 1000, borrowedAt: JAN_1, interestRateMonthly: null },
        FEB_1,
      ).toFixed(2),
    ).toBe("0.00");
  });

  it("prorratea por días con mes de 30 días", () => {
    const interest = accruedInterest(
      { principal: 1000, borrowedAt: JAN_1, interestRateMonthly: 2 },
      FEB_1,
    );
    // 31 días: 1000 * 0.02 * 31/30 = 20.666...
    expect(interest.toFixed(2)).toBe("20.67");
  });

  it("no acumula intereses negativos antes del préstamo", () => {
    expect(
      accruedInterest(
        { principal: 1000, borrowedAt: FEB_1, interestRateMonthly: 2 },
        JAN_1,
      ).toFixed(2),
    ).toBe("0.00");
  });
});

describe("saldo y estado de la deuda", () => {
  const debt = {
    principal: 1000,
    currency: "PEN" as const,
    borrowedAt: JAN_1,
    interestRateMonthly: 0,
  };

  it("deuda abierta sin pagos", () => {
    const snapshot = getDebtSnapshot(debt, [], FEB_1);
    expect(snapshot.status).toBe("OPEN");
    expect(snapshot.balance.toFixed(2)).toBe("1000.00");
  });

  it("pago parcial deja estado PARTIAL", () => {
    const snapshot = getDebtSnapshot(
      debt,
      [{ amount: 200, paidAt: FEB_1 }],
      FEB_1,
    );
    expect(snapshot.status).toBe("PARTIAL");
    expect(snapshot.balance.toFixed(2)).toBe("800.00");
  });

  it("pago total deja estado PAID y congela intereses", () => {
    const withInterest = { ...debt, interestRateMonthly: 10 };
    const payments = [{ amount: 1100, paidAt: JAN_31 }];
    const snapshot = getDebtSnapshot(withInterest, payments, FEB_28);

    expect(snapshot.status).toBe("PAID");
    expect(snapshot.balance.toFixed(2)).toBe("0.00");
  });

  it("deriva el estado y excluye pagos anulados", () => {
    const payments = [
      { amount: 500, paidAt: JAN_31 },
      { amount: 500, paidAt: FEB_1, voidedAt: FEB_1 },
    ];
    expect(deriveDebtStatus(debt, payments, FEB_1)).toBe("PARTIAL");
  });

  it("rechaza pagos por encima del saldo pendiente", () => {
    expect(canPayAmount(debt, [], 1000, FEB_1)).toBe(true);
    expect(canPayAmount(debt, [], 1000.01, FEB_1)).toBe(false);
    expect(
      balanceBeforePayment(debt, [{ amount: 200, paidAt: FEB_1 }], FEB_1).toFixed(
        2,
      ),
    ).toBe("800.00");
  });

  it("deriva vencida solo si no está pagada", () => {
    const dueDate = JAN_31;
    expect(isDebtOverdue({ dueDate }, "OPEN", FEB_1)).toBe(true);
    expect(isDebtOverdue({ dueDate }, "PAID", FEB_1)).toBe(false);
  });
});

describe("conversión de moneda", () => {
  it("aplica la tasa registrada", () => {
    expect(convertToBankrollCurrency(100, 3.75).toFixed(2)).toBe("375.00");
    expect(convertToBankrollCurrency(375, 0.2666667).toFixed(2)).toBe(
      "100.00",
    );
  });

  it("usa tasa 1 si la moneda coincide", () => {
    expect(
      resolveExchangeRate({
        amountCurrency: "PEN",
        bankrollCurrency: "PEN",
      })?.toFixed(2),
    ).toBe("1.00");
  });

  it("exige tasa cuando las monedas difieren", () => {
    expect(
      resolveExchangeRate({
        amountCurrency: "USD",
        bankrollCurrency: "PEN",
      }),
    ).toBeNull();
    expect(
      resolveExchangeRate({
        amountCurrency: "USD",
        bankrollCurrency: "PEN",
        exchangeRate: 3.75,
      })?.toFixed(2),
    ).toBe("3.75");
  });

  it("convierte deuda USD a PEN para reportes", () => {
    expect(convertDebtToPen(100, "USD", 3.75).toFixed(2)).toBe("375.00");
    expect(convertDebtToPen(100, "PEN", 3.75).toFixed(2)).toBe("100.00");
  });

  it("firma los movimientos según el tipo", () => {
    expect(signedAmountForTransaction("LOAN_IN", 375).toFixed(2)).toBe(
      "375.00",
    );
    expect(
      signedAmountForTransaction("LOAN_REPAYMENT", 375).toFixed(2),
    ).toBe("-375.00");
  });
});

describe("libro del bankroll", () => {
  const transactions = [
    { type: "LOAN_IN" as const, amountInBankrollCurrency: 375 },
    { type: "DEPOSIT" as const, amountInBankrollCurrency: 100 },
    { type: "WITHDRAWAL" as const, amountInBankrollCurrency: -50 },
    { type: "LOAN_REPAYMENT" as const, amountInBankrollCurrency: -200 },
  ];

  it("suma los movimientos al saldo", () => {
    expect(
      bankrollBalanceWithMovements(1000, transactions).toFixed(2),
    ).toBe("1225.00");
  });

  it("calcula capital aportado incluyendo préstamos", () => {
    expect(
      calculateCapitalContributed(1000, transactions).toFixed(2),
    ).toBe("1425.00");
  });

  it("calcula capital propio sin préstamos", () => {
    expect(calculateOwnCapital(1000, transactions).toFixed(2)).toBe(
      "1050.00",
    );
  });

  it("calcula ganancia disponible para pagar", () => {
    expect(
      availableProfitForRepayment({
        realizedProfit: 500,
        transactions,
      }).toFixed(2),
    ).toBe("300.00");
    expect(
      availableProfitForRepayment({
        realizedProfit: 100,
        transactions,
      }).toFixed(2),
    ).toBe("0.00");
  });

  it("calcula ratios de deuda y financiamiento", () => {
    expect(debtRatio(300, 1000).toFixed(2)).toBe("0.30");
    expect(debtRatio(300, 0).toFixed(2)).toBe("1.00");
    expect(loanFundedShare(300, 1000).toFixed(2)).toBe("0.23");
  });
});
