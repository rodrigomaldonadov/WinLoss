"use server";

import { z } from "zod";

import { auth } from "@/auth";
import {
  PARLAY_PROP_MARKETS,
  propLines,
  type ParlayPropMarket,
  type PropLine,
} from "@/lib/parlay/analysis";
import { getParlayProps } from "@/lib/parlay/client";

const MARKET_KEYS = PARLAY_PROP_MARKETS.map(([key]) => key) as [
  ParlayPropMarket,
  ...ParlayPropMarket[],
];

const propsSchema = z.object({
  sportKey: z.string().trim().min(1).max(60),
  eventId: z.string().trim().min(1).max(120),
  market: z.enum(MARKET_KEYS),
  homeTeam: z.string().trim().max(120),
  awayTeam: z.string().trim().max(120),
});

export type ResearchPropsResult =
  | { ok: true; lines: PropLine[] }
  | { ok: false; error: string };

/** Carga las props de un mercado concreto sin recargar la página. */
export async function loadResearchProps(
  input: unknown,
): Promise<ResearchPropsResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Tu sesión ha caducado." };

  const parsed = propsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Mercado de props inválido." };
  }

  const { sportKey, eventId, market, homeTeam, awayTeam } = parsed.data;

  try {
    const events = await getParlayProps(sportKey, market);
    if (!events) {
      return { ok: false, error: "No pudimos consultar ParlayAPI." };
    }

    const event = events.find((item) => item.id === eventId);
    if (!event) return { ok: true, lines: [] };

    const lines = propLines(event, market).filter(
      (line) => line.player !== homeTeam && line.player !== awayTeam,
    );
    return { ok: true, lines };
  } catch (error) {
    console.error("[research] loadResearchProps:", error);
    return { ok: false, error: "No pudimos cargar las cuotas." };
  }
}
