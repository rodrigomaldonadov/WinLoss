"use server";

import type { AutoSettleMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  mode: z.enum(["SUGGEST", "AUTO"]),
});

export type SettingsState = {
  ok?: boolean;
  error?: string;
};

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
