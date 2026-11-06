import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const betStatusSchema = z.enum([
  "PENDING",
  "WON",
  "LOST",
  "VOID",
  "HALF_WON",
  "HALF_LOST",
  "CASHOUT",
]);

export const betTypeSchema = z.enum(["SINGLE", "COMBINED"]);

export const createBetSchema = z.object({
  bankrollId: z.string().min(1, "Selecciona un bankroll"),
  bookmakerId: z.string().min(1).optional(),
  sport: z.string().trim().min(1, "Indica el deporte").max(60),
  competition: optionalText(80),
  eventName: z
    .string()
    .trim()
    .min(2, "Indica el evento")
    .max(120, "Máximo 120 caracteres"),
  market: z.string().trim().min(1, "Indica el mercado").max(80),
  selection: z
    .string()
    .trim()
    .min(1, "Indica tu selección")
    .max(100, "Máximo 100 caracteres"),
  odds: z.preprocess(
    (value) => (typeof value === "string" ? value.replace(",", ".") : value),
    z.coerce
      .number({ error: "Ingresa una cuota válida" })
      .min(1.01, "La cuota debe ser mayor que 1.00")
      .max(1000, "La cuota máxima es 1000"),
  ),
  stake: z.preprocess(
    (value) => (typeof value === "string" ? value.replace(",", ".") : value),
    z.coerce
      .number({ error: "Ingresa un stake válido" })
      .positive("El stake debe ser mayor que 0")
      .max(1_000_000, "El stake máximo es 1,000,000"),
  ),
  betType: betTypeSchema.default("SINGLE"),
  isFreeBet: z.coerce.boolean().default(false),
  placedAt: z.coerce.date({ error: "Fecha inválida" }),
  notes: optionalText(500),
});

export const updateBetSchema = createBetSchema.partial().extend({
  id: z.string().min(1),
});

export const settleBetSchema = z
  .object({
    id: z.string().min(1),
    status: betStatusSchema.exclude(["PENDING"]),
    cashoutAmount: z.coerce.number().positive().optional(),
  })
  .refine(
    (data) => data.status !== "CASHOUT" || data.cashoutAmount !== undefined,
    {
      path: ["cashoutAmount"],
      message: "Indica el importe del cashout",
    },
  );

export type CreateBetInput = z.infer<typeof createBetSchema>;
export type UpdateBetInput = z.infer<typeof updateBetSchema>;
export type SettleBetInput = z.infer<typeof settleBetSchema>;
export type BetStatusValue = z.infer<typeof betStatusSchema>;
