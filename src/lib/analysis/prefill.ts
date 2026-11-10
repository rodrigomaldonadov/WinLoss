import type { LegMarketKey } from "@prisma/client";

import type { BetFormDefaults } from "@/components/bets/bet-form";

import { bttsPick, matchResultPick, totalGoalsPick } from "./view";

export type AnalysisPrefillInput = {
  evento?: string | null;
  competicion?: string | null;
  fecha?: string | null;
  deporte?: string | null;
  mercadoKey?: string | null;
  mercado?: string | null;
  seleccion?: string | null;
  pick?: string | null;
  linea?: string | null;
  cuota?: string | null;
  subject?: string | null;
};

const ALLOWED_MARKET_KEYS = new Set<LegMarketKey>([
  "MATCH_RESULT",
  "TOTAL_GOALS",
  "BTTS",
  "CUSTOM",
]);

function parseLine(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOdds(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 1.01 && parsed <= 1000
    ? parsed
    : null;
}

function structuredSelection(input: AnalysisPrefillInput): {
  marketKey: LegMarketKey;
  market: string;
  selection: string;
  pick: string | null;
  line: number | null;
  subject: string | null;
} {
  const requested = input.mercadoKey?.trim() as LegMarketKey | undefined;
  const marketKey =
    requested && ALLOWED_MARKET_KEYS.has(requested) ? requested : "CUSTOM";

  if (marketKey === "MATCH_RESULT") {
    const outcome =
      input.pick === "DRAW" ? "draw" : input.pick === "AWAY" ? "away" : "home";
    const pick = matchResultPick(outcome);
    return {
      marketKey,
      market: input.mercado?.trim() || pick.market,
      selection: input.seleccion?.trim() || pick.selection,
      pick: pick.pick,
      line: null,
      subject: null,
    };
  }

  if (marketKey === "TOTAL_GOALS") {
    const side = input.pick === "UNDER" ? "UNDER" : "OVER";
    const line = parseLine(input.linea) ?? 2.5;
    const pick = totalGoalsPick(side, line);
    return {
      marketKey,
      market: input.mercado?.trim() || pick.market,
      selection: input.seleccion?.trim() || pick.selection,
      pick: pick.pick,
      line,
      subject: null,
    };
  }

  if (marketKey === "BTTS") {
    const side = input.pick === "NO" ? "NO" : "YES";
    const pick = bttsPick(side);
    return {
      marketKey,
      market: input.mercado?.trim() || pick.market,
      selection: input.seleccion?.trim() || pick.selection,
      pick: pick.pick,
      line: null,
      subject: null,
    };
  }

  return {
    marketKey: "CUSTOM",
    market: input.mercado?.trim() || "",
    selection: input.seleccion?.trim() || "",
    pick: input.pick?.trim() || null,
    line: parseLine(input.linea),
    subject: input.subject?.trim() || null,
  };
}

/**
 * Convierte los parámetros de /bets/new en valores iniciales del formulario.
 * Precarga evento, fecha y, si se tocó un mercado, mercado/línea/selección.
 * La cuota solo se precarga cuando llega explícita (`cuota`).
 */
export function buildAnalysisPrefill(
  input: AnalysisPrefillInput,
): BetFormDefaults | null {
  const eventName = input.evento?.trim();
  if (!eventName) return null;

  const sport = input.deporte?.trim() || "Fútbol";
  const competition = input.competicion?.trim() || null;
  const eventDate =
    input.fecha && /^\d{4}-\d{2}-\d{2}/.test(input.fecha)
      ? input.fecha.slice(0, 10)
      : null;
  const selection = structuredSelection(input);
  const odds = parseOdds(input.cuota);

  return {
    sport,
    competition,
    eventName,
    odds: odds ?? undefined,
    legs: [
      {
        sport,
        competition,
        eventName,
        eventDate,
        isBuilder: false,
        ...(odds !== null ? { odds } : {}),
        selections: [selection],
      },
    ],
  };
}

