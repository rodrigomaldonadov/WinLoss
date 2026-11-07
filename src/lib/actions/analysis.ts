"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { searchAnalysisTeams } from "@/lib/data/analysis-history";

const suggestionsSchema = z.object({
  query: z.string().trim().min(2).max(60),
});

export type TeamSuggestionsResult =
  | { ok: true; teams: { id: string; name: string }[] }
  | { ok: false; error: string };

/**
 * Autocompletado de equipos del historial. La normalización y los alias se
 * resuelven en el servidor; aquí solo se valida y se recorta la respuesta.
 */
export async function suggestHistoryTeamsAction(
  input: unknown,
): Promise<TeamSuggestionsResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Tu sesión ha caducado." };
  }

  const parsed = suggestionsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: true, teams: [] };
  }

  try {
    const teams = await searchAnalysisTeams(parsed.data.query);
    return { ok: true, teams };
  } catch (error) {
    console.error("[analysis] suggestHistoryTeamsAction:", error);
    return { ok: false, error: "No pudimos buscar equipos ahora." };
  }
}
