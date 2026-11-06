import { z } from "zod";

import { CURRENCIES } from "@/lib/constants";

const currencyCodes = CURRENCIES.map((currency) => currency.code) as [
  string,
  ...string[],
];

export const createBankrollSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(40, "Máximo 40 caracteres"),
  currency: z.enum(currencyCodes).default("PEN"),
  initialAmount: z.preprocess(
    (value) => (typeof value === "string" ? value.replace(",", ".") : value),
    z.coerce
      .number({ error: "Ingresa un importe válido" })
      .min(0, "El importe no puede ser negativo")
      .max(10_000_000, "El importe máximo es 10,000,000"),
  ),
});

export const updateBankrollSchema = createBankrollSchema
  .partial()
  .extend({ id: z.string().min(1) });

export type CreateBankrollInput = z.infer<typeof createBankrollSchema>;
export type UpdateBankrollInput = z.infer<typeof updateBankrollSchema>;
