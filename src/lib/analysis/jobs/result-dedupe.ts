import { normalizeTeamName } from "@/lib/analysis/team-names";

const TIME_ZONE_BY_CODE: Record<string, string> = {
  E0: "Europe/London",
  E1: "Europe/London",
  E2: "Europe/London",
  E3: "Europe/London",
  EC: "Europe/London",
  SP1: "Europe/Madrid",
  SP2: "Europe/Madrid",
  I1: "Europe/Rome",
  I2: "Europe/Rome",
  D1: "Europe/Berlin",
  D2: "Europe/Berlin",
  F1: "Europe/Paris",
  F2: "Europe/Paris",
  B1: "Europe/Brussels",
  N1: "Europe/Amsterdam",
  P1: "Europe/Lisbon",
  T1: "Europe/Istanbul",
  G1: "Europe/Athens",
  SC0: "Europe/London",
  SC1: "Europe/London",
  SC2: "Europe/London",
  SC3: "Europe/London",
  BRA: "America/Sao_Paulo",
  ARG: "America/Argentina/Buenos_Aires",
  PER1: "America/Lima",
};

export function localDateKey(date: Date, competitionCode?: string | null): string {
  const timeZone = competitionCode
    ? (TIME_ZONE_BY_CODE[competitionCode] ?? "UTC")
    : "UTC";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Clave común CSV/API. Usa el id canónico del equipo (resuelto por alias) para
 * que dos proveedores con nombres distintos no dupliquen el mismo partido.
 */
export function resultDedupeKey({
  competition,
  competitionCode,
  playedAt,
  homeTeamId,
  awayTeamId,
}: {
  competition: string;
  competitionCode?: string | null;
  playedAt: Date;
  homeTeamId: string;
  awayTeamId: string;
}): string {
  return [
    competition,
    localDateKey(playedAt, competitionCode),
    normalizeTeamName(homeTeamId) || homeTeamId,
    normalizeTeamName(awayTeamId) || awayTeamId,
  ].join("|");
}

const ANNUAL_CODES = new Set([
  "ARG",
  "BRA",
  "AUT",
  "DNK",
  "FIN",
  "IRL",
  "MEX",
  "NOR",
  "POL",
  "ROU",
  "SWE",
  "SWZ",
  "USA",
]);

export function seasonForResult(
  competitionCode: string | null | undefined,
  playedAt: Date,
): { seasonStart: number; season: string } {
  const year = playedAt.getUTCFullYear();
  const annual = competitionCode ? ANNUAL_CODES.has(competitionCode) : false;
  const seasonStart = annual
    ? year
    : playedAt.getUTCMonth() + 1 >= 7
      ? year
      : year - 1;
  return {
    seasonStart,
    season: annual
      ? String(seasonStart)
      : `${seasonStart}/${String(seasonStart + 1).slice(-2)}`,
  };
}
