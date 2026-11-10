"use server";

import type { AutoSettleMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  mode: z.enum(["SUGGEST", "AUTO"]),
});

const debtPreferencesSchema = z.object({
  usdToPenRate: z.preprocess(
    (value) => (typeof value === "string" ? value.replace(",", ".") : value),
    z.coerce
      .number({ error: "Tasa inválida" })
      .positive("La tasa debe ser mayor que 0")
      .max(1_000_000, "Tasa inválida"),
  ),
  debtAlertThresholdPct: z.preprocess(
    (value) => (typeof value === "string" ? value.replace(",", ".") : value),
    z.coerce
      .number({ error: "Umbral inválido" })
      .min(0, "El umbral no puede ser negativo")
      .max(100, "El umbral máximo es 100"),
  ),
  showDebts: z.preprocess(
    (value) => value === true || value === "true" || value === "on",
    z.boolean(),
  ),
});

export type SettingsState = {
  ok?: boolean;
  error?: string;
};

const responsibleSchema = z.object({
  weeklyStakeLimit: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? null
        : typeof value === "string"
          ? value.replace(",", ".")
          : value,
    z.coerce
      .number({ error: "Límite inválido" })
      .min(0, "El límite no puede ser negativo")
      .max(1_000_000, "El límite es demasiado alto")
      .nullable(),
  ),
  selfExclusionDays: z.enum(["active", "none", "1", "7", "30"]),
});

export async function updateAutoSettleModeAction(
  _prevState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado." };
  }

  const parsed = schema.safeParse({ mode: formData.get("mode") });
  if (!parsed.success) {
    return { error: "Opción inválida." };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { autoSettleMode: parsed.data.mode as AutoSettleMode },
    });
  } catch (error) {
    console.error("[settings] autoSettleMode:", error);
    return { error: "No pudimos guardar la preferencia." };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function updateDebtPreferencesAction(
  _prevState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado." };
  }

  const parsed = debtPreferencesSchema.safeParse({
    usdToPenRate: formData.get("usdToPenRate"),
    debtAlertThresholdPct: formData.get("debtAlertThresholdPct"),
    showDebts: formData.get("showDebts"),
  });

  if (!parsed.success) {
    return { error: "Revisa la tasa y el umbral de deuda." };
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: parsed.data,
    });
  } catch (error) {
    console.error("[settings] debtPreferences:", error);
    return { error: "No pudimos guardar las preferencias de deuda." };
  }

  revalidatePath("/settings");
  revalidatePath("/debts");
  revalidatePath("/");
  revalidatePath("/bankroll");
  return { ok: true };
}

export async function updateResponsibleGamblingAction(
  _prevState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "Tu sesión ha caducado." };
  }

  const parsed = responsibleSchema.safeParse({
    weeklyStakeLimit: formData.get("weeklyStakeLimit"),
    selfExclusionDays: formData.get("selfExclusionDays"),
  });

  if (!parsed.success) {
    return { error: "Revisa el límite semanal." };
  }

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { selfExclusionUntil: true },
  });

  let selfExclusionUntil = current?.selfExclusionUntil ?? null;
  if (
    parsed.data.selfExclusionDays !== "none" &&
    parsed.data.selfExclusionDays !== "active"
  ) {
    const days = Number(parsed.data.selfExclusionDays);
    const candidate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    if (!selfExclusionUntil || candidate > selfExclusionUntil) {
      selfExclusionUntil = candidate;
    }
  }

  const limit = parsed.data.weeklyStakeLimit;
  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        weeklyStakeLimit: limit !== null && limit > 0 ? limit : null,
        selfExclusionUntil,
      },
    });
  } catch (error) {
    console.error("[settings] responsibleGambling:", error);
    return { error: "No pudimos guardar las preferencias." };
  }

  revalidatePath("/settings");
  revalidatePath("/bets/new");
  return { ok: true };
}
