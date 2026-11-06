"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { searchEvents, type ApiEvent } from "@/lib/sports-api";

const searchSchema = z.object({
  sport: z.string().trim().min(1).max(60),
  competition: z.string().trim().max(80).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

export type SportsSearchResult =
  | { ok: true; events: ApiEvent[] }
  | { ok: false; error: string };

/** Busca eventos en los proveedores configurados. Nunca lanza al cliente. */
export async function searchEventsAction(input: unknown): Promise<SportsSearchResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Tu sesión ha caducado." };
  }

  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Revisa el deporte y el rango de fechas." };
  }

  const { sport, competition, from, to } = parsed.data;
  const [start, end] = from <= to ? [from, to] : [to, from];

  try {
    const events = await searchEvents({
      sport,
      competition,
      from: start,
      to: end,
    });
    return { ok: true, events };
  } catch (error) {
    console.error("[sports-api] searchEventsAction:", error);
    return {
      ok: false,
      error:
        "No pudimos consultar el calendario ahora. Puedes ingresar el evento manualmente.",
    };
  }
}
