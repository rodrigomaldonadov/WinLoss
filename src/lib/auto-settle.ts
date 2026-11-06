import type { LegMarketKey, LegStatus } from "@prisma/client";

export type Score = { home: number; away: number };

export type ResolvableSelection = {
  marketKey: LegMarketKey;
  pick: string | null;
  line: number | null;
};

const OUTCOME = {
  HOME: "HOME",
  DRAW: "DRAW",
  AWAY: "AWAY",
} as const;

function matchResult(score: Score): "HOME" | "DRAW" | "AWAY" {
  if (score.home > score.away) return OUTCOME.HOME;
  if (score.home < score.away) return OUTCOME.AWAY;
  return OUTCOME.DRAW;
}

function totalGoals(score: Score): number {
  return score.home + score.away;
}

function combineQuarter(results: LegStatus[]): LegStatus {
  if (results.every((status) => status === "WON")) return "WON";
  if (results.every((status) => status === "LOST")) return "LOST";
  if (results.every((status) => status === "VOID")) return "VOID";
  if (results.includes("WON") && results.includes("VOID")) return "HALF_WON";
  if (results.includes("LOST") && results.includes("VOID")) return "HALF_LOST";
  // Mezcla WON + LOST no es posible con una línea de cuarto.
  return "VOID";
}

function resolveTotalLine(
  total: number,
  line: number,
  pick: string,
): LegStatus {
  if (total === line) return "VOID";
  const over = total > line;
  const won = pick === "OVER" ? over : !over;
  return won ? "WON" : "LOST";
}

function resolveTotalGoals(
  total: number,
  line: number | null,
  pick: string | null,
): LegStatus | null {
  if (line === null || !Number.isFinite(line)) return null;
  if (pick !== "OVER" && pick !== "UNDER") return null;

  // Líneas de cuarto (x.25 / x.75) se dividen en dos mitades.
  const isQuarter = Math.abs((line * 4) % 2) === 1;
  if (isQuarter) {
    return combineQuarter([
      resolveTotalLine(total, line - 0.25, pick),
      resolveTotalLine(total, line + 0.25, pick),
    ]);
  }

  return resolveTotalLine(total, line, pick);
}

/**
 * Resuelve una selección estructurada. Devuelve null cuando el mercado es
 * manual o los datos no permiten resolverla.
 */
export function resolveSelection(
  selection: ResolvableSelection,
  score: Score,
): LegStatus | null {
  const { marketKey, pick } = selection;

  switch (marketKey) {
    case "MATCH_RESULT": {
      if (pick !== "HOME" && pick !== "DRAW" && pick !== "AWAY") return null;
      return matchResult(score) === pick ? "WON" : "LOST";
    }
    case "DOUBLE_CHANCE": {
      const result = matchResult(score);
      if (pick === "HOME_DRAW") {
        return result === "HOME" || result === "DRAW" ? "WON" : "LOST";
      }
      if (pick === "HOME_AWAY") {
        return result === "HOME" || result === "AWAY" ? "WON" : "LOST";
      }
      if (pick === "DRAW_AWAY") {
        return result === "DRAW" || result === "AWAY" ? "WON" : "LOST";
      }
      return null;
    }
    case "DRAW_NO_BET": {
      if (pick !== "HOME" && pick !== "AWAY") return null;
      if (matchResult(score) === "DRAW") return "VOID";
      return matchResult(score) === pick ? "WON" : "LOST";
    }
    case "TOTAL_GOALS":
      return resolveTotalGoals(totalGoals(score), selection.line, pick);
    case "BTTS": {
      if (pick !== "YES" && pick !== "NO") return null;
      const both = score.home > 0 && score.away > 0;
      return (pick === "YES") === both ? "WON" : "LOST";
    }
    case "CUSTOM":
    default:
      return null;
  }
}

/**
 * Combina las selecciones de un Bet Builder:
 * todas WON → WON; alguna LOST → LOST; cualquier otro caso → null (revisión).
 */
export function combineBuilderResults(
  results: LegStatus[],
): LegStatus | null {
  if (results.length === 0) return null;
  if (results.some((status) => status === "LOST")) return "LOST";
  if (results.every((status) => status === "WON")) return "WON";
  return null;
}

export type ResolvableLeg = {
  isBuilder: boolean;
  selections: ResolvableSelection[];
};

/** Resuelve un leg completo (simple o builder). */
export function resolveLegStatus(
  leg: ResolvableLeg,
  score: Score,
): LegStatus | null {
  const results = leg.selections.map((selection) =>
    resolveSelection(selection, score),
  );

  if (results.some((status) => status === null)) return null;

  if (leg.isBuilder) {
    return combineBuilderResults(results as LegStatus[]);
  }

  return results[0] ?? null;
}
