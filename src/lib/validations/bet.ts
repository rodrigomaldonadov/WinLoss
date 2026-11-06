import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalDecimal = (message: string) =>
  z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? undefined
        : typeof value === "string"
          ? value.replace(",", ".")
          : value,
    z.coerce
      .number({ error: message })
      .positive(message)
      .optional(),
  );

const requiredOdds = z.preprocess(
  (value) => (typeof value === "string" ? value.replace(",", ".") : value),
  z.coerce
    .number({ error: "Ingresa una cuota válida" })
    .min(1.01, "La cuota debe ser mayor que 1.00")
    .max(1000, "La cuota máxima es 1000"),
);

const optionalDate = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? undefined : value,
  z
    .string()
    .trim()
    .max(32, "Fecha del evento inválida")
    .optional(),
);

export const betStatusSchema = z.enum([
  "PENDING",
  "WON",
  "LOST",
  "VOID",
  "HALF_WON",
  "HALF_LOST",
  "CASHOUT",
]);

export const legStatusSchema = z.enum([
  "PENDING",
  "WON",
  "LOST",
  "VOID",
  "HALF_WON",
  "HALF_LOST",
]);

export const betTypeSchema = z.enum(["SINGLE", "COMBINED"]);

export const legSelectionSchema = z.object({
  market: z
    .string()
    .trim()
    .min(1, "Indica el mercado")
    .max(80, "Máximo 80 caracteres"),
  selection: z
    .string()
    .trim()
    .min(1, "Indica tu selección")
    .max(100, "Máximo 100 caracteres"),
});

export const betLegSchema = z
  .object({
    sport: z.string().trim().min(1, "Indica el deporte").max(60),
    competition: optionalText(80),
    eventName: z
      .string()
      .trim()
      .min(2, "Indica el evento")
      .max(120, "Máximo 120 caracteres"),
    eventDate: optionalDate,
    isBuilder: z.preprocess(
      (value) => value === true || value === "true" || value === "on",
      z.boolean(),
    ),
    odds: requiredOdds,
    selections: z
      .array(legSelectionSchema)
      .min(1, "Añade al menos una selección")
      .max(20, "Máximo 20 selecciones por partido"),
  })
  .superRefine((leg, ctx) => {
    if (leg.isBuilder && leg.selections.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["selections"],
        message: "Un Bet Builder necesita al menos 2 selecciones.",
      });
    }

    if (!leg.isBuilder && leg.selections.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["selections"],
        message: "Un partido normal debe tener exactamente una selección.",
      });
    }
  });

export const createBetSchema = z.object({
  bankrollId: z.string().min(1, "Selecciona un bankroll"),
  bookmakerId: z.preprocess(
    (value) =>
      value === "" || value === null || value === "none" ? undefined : value,
    z.string().min(1).optional(),
  ),
  externalId: optionalText(80),
  odds: requiredOdds,
  stake: z.preprocess(
    (value) => (typeof value === "string" ? value.replace(",", ".") : value),
    z.coerce
      .number({ error: "Ingresa un stake válido" })
      .positive("El stake debe ser mayor que 0")
      .max(1_000_000, "El stake máximo es 1,000,000"),
  ),
  isFreeBet: z.preprocess(
    (value) => value === true || value === "true" || value === "on",
    z.boolean(),
  ),
  placedAt: z
    .string()
    .trim()
    .min(1, "Indica la fecha")
    .max(32, "Fecha inválida"),
  notes: optionalText(500),
  legs: z
    .array(betLegSchema)
    .min(1, "Añade al menos un partido")
    .max(20, "Máximo 20 partidos por boleto"),
});

export const updateBetSchema = createBetSchema.extend({
  id: z.string().min(1),
});

export const settleLegSchema = z.object({
  id: z.string().min(1),
  status: legStatusSchema,
  closingOdds: optionalDecimal("Cuota de cierre inválida"),
});

export const settleBetSchema = z.object({
  id: z.string().min(1),
  legs: z
    .array(settleLegSchema)
    .min(1, "Indica el resultado de al menos un partido")
    .max(20),
  cashoutAmount: optionalDecimal("Importe de cashout inválido"),
});

export type CreateBetInput = z.infer<typeof createBetSchema>;
export type UpdateBetInput = z.infer<typeof updateBetSchema>;
export type SettleBetInput = z.infer<typeof settleBetSchema>;
export type BetStatusValue = z.infer<typeof betStatusSchema>;
export type LegStatusValue = z.infer<typeof legStatusSchema>;
export type BetLegInput = z.infer<typeof betLegSchema>;
