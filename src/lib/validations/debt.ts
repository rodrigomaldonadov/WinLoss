import { z } from "zod";

import { DEBT_CURRENCIES } from "@/lib/constants";

export const debtCurrencySchema = z.enum(DEBT_CURRENCIES);
export const debtPaymentSourceSchema = z.enum([
  "FROM_BANKROLL",
  "EXTERNAL",
]);
export const bankrollMovementTypeSchema = z.enum([
  "DEPOSIT",
  "WITHDRAWAL",
]);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalDecimal = (message: string, max = 1_000_000_000) =>
  z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? undefined
        : typeof value === "string"
          ? value.replace(",", ".")
          : value,
    z.coerce
      .number({ error: message })
      .min(0, message)
      .max(max, message)
      .optional(),
  );

const requiredDecimal = (message: string, max = 1_000_000_000) =>
  z.preprocess(
    (value) =>
      typeof value === "string" ? value.replace(",", ".") : value,
    z.coerce
      .number({ error: message })
      .positive(message)
      .max(max, message),
  );

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Indica una fecha válida");

const optionalDateString = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? undefined : value,
  dateString.optional(),
);

const booleanFlag = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.boolean(),
);

export const createDebtSchema = z.object({
  bankrollId: z.string().min(1, "Selecciona un bankroll"),
  lenderName: z
    .string()
    .trim()
    .min(2, "Indica el acreedor")
    .max(120, "Máximo 120 caracteres"),
  principal: requiredDecimal("Ingresa un monto válido", 1_000_000_000_000),
  currency: debtCurrencySchema,
  borrowedAt: dateString,
  dueDate: optionalDateString,
  interestRateMonthly: optionalDecimal("Interés inválido", 1_000),
  addToBankroll: booleanFlag,
  exchangeRate: optionalDecimal("Tasa de cambio inválida", 1_000_000),
  notes: optionalText(500),
});

export const updateDebtSchema = z.object({
  id: z.string().min(1),
  lenderName: z
    .string()
    .trim()
    .min(2, "Indica el acreedor")
    .max(120, "Máximo 120 caracteres"),
  dueDate: optionalDateString,
  interestRateMonthly: optionalDecimal("Interés inválido", 1_000),
  notes: optionalText(500),
});

export const debtPaymentSchema = z.object({
  debtId: z.string().min(1),
  amount: requiredDecimal("Ingresa un monto válido", 1_000_000_000_000),
  paidAt: dateString,
  source: debtPaymentSourceSchema,
  exchangeRate: optionalDecimal("Tasa de cambio inválida", 1_000_000),
  note: optionalText(300),
});

export const voidPaymentSchema = z.object({
  paymentId: z.string().min(1),
});

export const deleteDebtSchema = z.object({
  id: z.string().min(1),
});

export const bankrollMovementSchema = z.object({
  bankrollId: z.string().min(1),
  type: bankrollMovementTypeSchema,
  amount: requiredDecimal("Ingresa un monto válido", 1_000_000_000_000),
  currency: debtCurrencySchema,
  occurredAt: dateString,
  exchangeRate: optionalDecimal("Tasa de cambio inválida", 1_000_000),
  note: optionalText(300),
});

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type UpdateDebtInput = z.infer<typeof updateDebtSchema>;
export type DebtPaymentInput = z.infer<typeof debtPaymentSchema>;
export type BankrollMovementInput = z.infer<typeof bankrollMovementSchema>;
