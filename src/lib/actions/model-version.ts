"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  promotionPlan,
  rollbackPlan,
} from "@/lib/analysis/model-version";
import { getPromotionDecisionForVersion } from "@/lib/data/model-versions";
import { prisma } from "@/lib/prisma";

async function authorized(): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  const adminEmail = process.env.ANALYSIS_ADMIN_EMAIL?.trim();
  if (adminEmail && session.user.email !== adminEmail) return false;
  return true;
}

function versionId(formData: FormData): string | null {
  const value = formData.get("versionId");
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mergeMetrics(
  metrics: Prisma.JsonValue | null,
  key: "promotion" | "rollback",
  value: Prisma.InputJsonValue,
): Prisma.InputJsonValue {
  const base =
    metrics && typeof metrics === "object" && !Array.isArray(metrics)
      ? (metrics as Record<string, Prisma.JsonValue>)
      : {};
  return { ...base, [key]: value } as Prisma.InputJsonValue;
}

/** Promueve un retador solo si cumple la regla forward. */
export async function promoteModelVersionAction(formData: FormData) {
  if (!(await authorized())) return;
  const id = versionId(formData);
  if (!id) return;

  const challenger = await prisma.modelVersion.findUnique({ where: { id } });
  if (!challenger || challenger.state !== "CHALLENGER") return;

  const decision = await getPromotionDecisionForVersion(id);
  if (!decision.eligible) return;

  const champion = await prisma.modelVersion.findFirst({
    where: { state: "CHAMPION" },
    orderBy: { promotedAt: "desc" },
  });
  const now = new Date();
  const plan = promotionPlan(champion?.id ?? null, id);

  await prisma.$transaction(async (tx) => {
    if (plan.retireId) {
      await tx.modelVersion.update({
        where: { id: plan.retireId },
        data: { state: "RETIRED", retiredAt: now },
      });
    }
    await tx.modelVersion.update({
      where: { id: plan.promoteId },
      data: {
        state: "CHAMPION",
        promotedAt: now,
        previousVersionId: plan.previousVersionId,
        metrics: mergeMetrics(challenger.metrics, "promotion", {
          at: now.toISOString(),
          before: champion?.metrics ?? null,
          after: challenger.metrics,
          decision,
        } as unknown as Prisma.InputJsonValue),
        notes: `Promovido manualmente el ${now.toISOString()}.`,
      },
    });
  });

  revalidatePath("/settings");
  revalidatePath("/analysis");
}

/** Restaura una versión retirada como campeona. */
export async function rollbackModelVersionAction(formData: FormData) {
  if (!(await authorized())) return;
  const id = versionId(formData);
  if (!id) return;

  const target = await prisma.modelVersion.findUnique({ where: { id } });
  if (!target || target.state !== "RETIRED") return;

  const champion = await prisma.modelVersion.findFirst({
    where: { state: "CHAMPION" },
    orderBy: { promotedAt: "desc" },
  });
  if (champion?.id === target.id) return;
  const now = new Date();
  const plan = rollbackPlan(champion?.id ?? null, id);

  await prisma.$transaction(async (tx) => {
    if (plan.retireId) {
      await tx.modelVersion.update({
        where: { id: plan.retireId },
        data: { state: "RETIRED", retiredAt: now },
      });
    }
    await tx.modelVersion.update({
      where: { id: plan.promoteId },
      data: {
        state: "CHAMPION",
        promotedAt: now,
        previousVersionId: plan.previousVersionId,
        metrics: mergeMetrics(target.metrics, "rollback", {
          at: now.toISOString(),
          before: champion?.metrics ?? null,
          after: target.metrics,
        } as unknown as Prisma.InputJsonValue),
        notes: `Rollback manual el ${now.toISOString()}.`,
      },
    });
  });

  revalidatePath("/settings");
  revalidatePath("/analysis");
}
