"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  getAutoSettleMode,
  runAutoSettlement,
  type AutoSettleRun,
} from "@/lib/auto-settle-runner";
import type { AutoSettleMode } from "@prisma/client";

export type AutoSettleActionResult =
  | {
      ok: true;
      mode: AutoSettleMode;
      applied: number;
      proposals: AutoSettleRun["proposals"];
      notices: AutoSettleRun["notices"];
    }
  | { ok: false; error: string };

function revalidateSettledViews() {
  revalidatePath("/");
  revalidatePath("/bets");
  revalidatePath("/bankroll");
}

async function run(
  forceApply: boolean | null,
): Promise<AutoSettleActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Tu sesión ha caducado." };
  }

  const mode = await getAutoSettleMode(session.user.id);
  const apply = forceApply ?? mode === "AUTO";

  try {
    const result = await runAutoSettlement(session.user.id, { apply });
    if (apply && result.applied > 0) revalidateSettledViews();

    return {
      ok: true,
      mode,
      applied: result.applied,
      proposals: result.proposals,
      notices: result.notices,
    };
  } catch (error) {
    console.error("[auto-settle] sync:", error);
    return {
      ok: false,
      error: "No pudimos verificar los resultados. Inténtalo de nuevo.",
    };
  }
}

/**
 * Verifica resultados pendientes.
 * - Modo AUTO: aplica directamente.
 * - Modo SUGGEST: devuelve propuestas para confirmar.
 */
export async function syncPendingResultsAction(): Promise<AutoSettleActionResult> {
  return run(null);
}

/** Confirma y aplica las propuestas revisadas en el Sheet. */
export async function applyPendingResultsAction(): Promise<AutoSettleActionResult> {
  return run(true);
}
