"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { getUserPreferences } from "@/lib/data/user";
import { zonedDateTimeToUtc } from "@/lib/date";
import { prisma } from "@/lib/prisma";

const rateNumber = z.preprocess(
  (value) =>
    typeof value === "string" ? value.replace(",", ".") : value,
  z.coerce
    .number({ error: "Indica una tasa válida" })
    .positive("La tasa debe ser mayor que 0")
    .max(1_000_000, "Tasa fuera de rango"),
);

const saveSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Indica el banco o la casa de cambio")
    .max(60, "Máximo 60 caracteres"),
  buyRate: rateNumber,
  sellRate: rateNumber,
  effectiveAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Indica una fecha válida"),
  note: z
    .string()
    .trim()
    .max(200, "Máximo 200 caracteres")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ExchangeRateActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

function revalidateRateViews() {
  for (const path of ["/settings", "/debts", "/"]) {
    revalidatePath(path);
  }
}

export async function saveExchangeRate(
  _prevState: ExchangeRateActionState,
  formData: FormData,
): Promise<ExchangeRateActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Tu sesión ha caducado." };

  const parsed = saveSchema.safeParse({
    label: formData.get("label"),
    buyRate: formData.get("buyRate"),
    sellRate: formData.get("sellRate"),
    effectiveAt: formData.get("effectiveAt"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const preferences = await getUserPreferences(session.user.id);
  const effectiveAt = zonedDateTimeToUtc(
    `${parsed.data.effectiveAt}T12:00`,
    preferences.timezone,
  );

  try {
    await prisma.exchangeRate.create({
      data: {
        userId: session.user.id,
        label: parsed.data.label,
        buyRate: parsed.data.buyRate,
        sellRate: parsed.data.sellRate,
        effectiveAt,
        note: parsed.data.note ?? null,
      },
    });
    revalidateRateViews();
    return { ok: true };
  } catch (error) {
    console.error("[exchange-rates] save:", error);
    return { error: "No pudimos guardar la tasa." };
  }
}

/** Elimina una entrada del historial; las deudas conservan la tasa copiada. */
export async function deleteExchangeRate(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) return;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  await prisma.exchangeRate.deleteMany({
    where: { id, userId: session.user.id },
  });
  revalidateRateViews();
}
