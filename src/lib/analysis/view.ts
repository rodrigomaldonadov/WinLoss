import type { AnalysisResult } from "./engine";

/** Datos de presentación de /analysis. No contienen cálculos nuevos. */

export type AnalysisFeedItem = {
  id: string;
  fixtureId: string;
  competition: string;
  competitionCode: string | null;
  kickoff: Date;
  homeName: string;
  awayName: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  final: AnalysisResult["final"];
  sources: AnalysisResult["sources"];
  reference: AnalysisResult["reference"];
  naiveReference: {
    brier: number;
    sample: number;
    probabilities: number[];
  } | null;
  notes: string[];
};

export type AnalysisFormMatch = {
  id: string;
  playedAt: Date;
  competition: string;
  opponent: string;
  venue: "home" | "away";
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
};

export type AnalysisTeamForm = {
  teamId: string;
  teamName: string;
  matches: AnalysisFormMatch[];
  summary: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  };
};

export type AnalysisH2HMatch = {
  id: string;
  playedAt: Date;
  competition: string;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
};

export type AnalysisH2H = {
  matches: AnalysisH2HMatch[];
  summary: {
    played: number;
    homeWins: number;
    draws: number;
    awayWins: number;
  };
};

export type AnalysisPrivateSelection = {
  id: string;
  market: string;
  selection: string;
  pick: string | null;
  line: number | null;
};

export type AnalysisPrivateLeg = {
  id: string;
  status: string;
  eventName: string;
  eventDate: Date | null;
  odds: number;
  selections: AnalysisPrivateSelection[];
};

export type AnalysisQuality = {
  generatedAt: string | null;
  marketCapturedAt: string | null;
  marketFresh: boolean;
  modelSample: number | null;
  sourcesUsed: string[];
  fixtureIds: string[];
  referenceAsOf: string | null;
};

export type AnalysisDetail = AnalysisFeedItem & {
  form: {
    home: AnalysisTeamForm;
    away: AnalysisTeamForm;
  };
  h2h: AnalysisH2H;
  privateLegs: AnalysisPrivateLeg[];
  quality: AnalysisQuality;
};

export const ANALYSIS_DAY_OPTIONS = [3, 7, 14] as const;
export type AnalysisDays = (typeof ANALYSIS_DAY_OPTIONS)[number];

export const OUTCOMES = [
  { key: "home", label: "Local", short: "1" },
  { key: "draw", label: "Empate", short: "X" },
  { key: "away", label: "Visitante", short: "2" },
] as const;

export type OutcomeKey = (typeof OUTCOMES)[number]["key"];

/** Etiqueta compacta y determinista, sin decimales inventados. */
export function probabilityLabel(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/** Cuota justa = 1 / probabilidad. Devuelve null si no hay probabilidad. */
export function fairOdds(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return 1 / value;
}

/**
 * Diferencia porcentual entre la cuota justa del modelo y la del mercado.
 * Positivo = el modelo da más cuota (menos probabilidad que el mercado).
 */
export function fairOddsDifference(
  modelProbability: number | null | undefined,
  marketProbability: number | null | undefined,
): number | null {
  const model = fairOdds(modelProbability);
  const market = fairOdds(marketProbability);
  if (model === null || market === null) return null;
  return model / market - 1;
}

export function confidenceLabel(
  confidence: AnalysisResult["final"]["confidence"],
): string {
  if (confidence === "HIGH") return "Alta";
  if (confidence === "MEDIUM") return "Media";
  if (confidence === "LOW") return "Baja";
  return "Sin datos";
}

export function competitionKey(
  item: Pick<AnalysisFeedItem, "competition" | "competitionCode">,
): string {
  return item.competitionCode ?? item.competition;
}

export function analysisHref({
  days,
  competitions = [],
}: {
  days: number;
  competitions?: string[];
}): string {
  const params = new URLSearchParams();
  if (days !== 7) params.set("dias", String(days));
  for (const competition of competitions) {
    params.append("competicion", competition);
  }
  const query = params.toString();
  return query ? `/analysis?${query}` : "/analysis";
}

export type AnalysisMarketPick = {
  marketKey: "MATCH_RESULT" | "TOTAL_GOALS" | "BTTS";
  market: string;
  selection: string;
  pick: string;
  line: number | null;
  subject?: string | null;
};

export function matchResultPick(outcome: OutcomeKey): AnalysisMarketPick {
  const map = {
    home: { pick: "HOME", selection: "Local" },
    draw: { pick: "DRAW", selection: "Empate" },
    away: { pick: "AWAY", selection: "Visitante" },
  } as const;
  return {
    marketKey: "MATCH_RESULT",
    market: "Resultado final (1X2)",
    ...map[outcome],
    line: null,
  };
}

export function totalGoalsPick(
  side: "OVER" | "UNDER",
  line = 2.5,
): AnalysisMarketPick {
  return {
    marketKey: "TOTAL_GOALS",
    market: "Total de goles",
    selection: `${side === "OVER" ? "Más de" : "Menos de"} ${line}`,
    pick: side,
    line,
  };
}

export function bttsPick(side: "YES" | "NO"): AnalysisMarketPick {
  return {
    marketKey: "BTTS",
    market: "Ambos equipos marcan",
    selection: side === "YES" ? "Sí" : "No",
    pick: side,
    line: null,
  };
}

/** Enlace de precarga a /bets/new. Solo incluye datos visibles del partido. */
export function analysisBetHref(
  item: Pick<
    AnalysisFeedItem,
    "id" | "homeName" | "awayName" | "competition" | "kickoff"
  >,
  pick?: AnalysisMarketPick,
): string {
  const params = new URLSearchParams({
    evento: `${item.homeName} vs ${item.awayName}`,
    competicion: item.competition,
    fecha: item.kickoff.toISOString(),
    deporte: "Fútbol",
    origen: "Consenso",
    analisis: item.id,
  });
  if (pick) {
    params.set("mercadoKey", pick.marketKey);
    params.set("mercado", pick.market);
    params.set("seleccion", pick.selection);
    params.set("pick", pick.pick);
    if (pick.line !== null) params.set("linea", String(pick.line));
    if (pick.subject) params.set("subject", pick.subject);
  }
  return `/bets/new?${params.toString()}`;
}
