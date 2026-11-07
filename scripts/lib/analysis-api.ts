/**
 * Cliente mínimo de próximos partidos para los comandos de análisis.
 *
 * No se usa en runtime de la app: los scripts lo ejecutan manualmente. Evita
 * importar `server-only` para poder correr con tsx fuera de Next.
 */

import { existsSync, readFileSync } from "node:fs";

import { getCompetitionProviderKeys } from "../../src/lib/catalogs/competitions";

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 21;
const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json";
const FD_BASE = "https://api.football-data.org/v4";

export const TARGETS = [
  { code: "E0", competition: "Premier League" },
  { code: "SP1", competition: "LaLiga" },
  { code: "I1", competition: "Serie A" },
  { code: "D1", competition: "Bundesliga" },
  { code: "F1", competition: "Ligue 1" },
  { code: "BRA", competition: "Brasileirão Serie A" },
  { code: "ARG", competition: "Liga Profesional" },
  { code: "PER1", competition: "Liga 1" },
] as const;

export type ApiFixture = {
  provider: "football-data" | "thesportsdb";
  competition: string;
  competitionCode: string | null;
  externalId: string;
  kickoff: string;
  home: string;
  away: string;
};

type TsdbEvent = {
  idEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strTimestamp?: string;
  dateEvent?: string;
  strTime?: string;
};

type FdMatch = {
  id: number;
  utcDate: string;
  homeTeam?: { name?: string | null };
  awayTeam?: { name?: string | null };
};

const TSDB_LEAGUE_IDS: Record<string, string> = {
  "English Premier League": "4328",
  "Spanish La Liga": "4335",
  "Italian Serie A": "4332",
  "German Bundesliga": "4331",
  "French Ligue 1": "4334",
  "Brazilian Serie A": "4351",
  "Argentinian Primera Division": "4406",
  "Peruvian Primera Division": "4688",
};

export function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match?.[1]) {
      process.env[match[1]] ??= (match[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(25_000),
    });
    const text = await response.text();
    if (response.ok && text.trim().startsWith("{")) {
      return JSON.parse(text);
    }
    lastError = new Error(
      `${response.status} ${response.statusText} ${
        text.trim().startsWith("{") ? "" : "(respuesta no JSON)"
      }`.trim(),
    );
    if (response.status !== 429) break;
    await sleep(4_000 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new Error("fetch falló");
}

function tsdbLeagueId(competition: string): string | null {
  const key = getCompetitionProviderKeys("Fútbol", competition)?.sportsDb;
  return key ? (TSDB_LEAGUE_IDS[key] ?? null) : null;
}

export async function fetchTsdbFixtures(
  competition: string,
  now: Date,
): Promise<ApiFixture[]> {
  const leagueId = tsdbLeagueId(competition);
  if (!leagueId) return [];
  const key = process.env.THESPORTSDB_API_KEY ?? "123";
  const json = (await fetchJson(
    `${TSDB_BASE}/${key}/eventsnextleague.php?id=${leagueId}`,
  )) as { events?: TsdbEvent[] | null };
  const until = now.getTime() + WINDOW_DAYS * DAY_MS;
  return (json.events ?? [])
    .map((event) => {
      const timestamp = event.strTimestamp;
      const kickoff = timestamp
        ? /Z$|[+-]\d{2}:\d{2}$/.test(timestamp)
          ? timestamp
          : `${timestamp}Z`
        : `${event.dateEvent ?? ""}T${event.strTime ?? "00:00:00"}Z`;
      return {
        provider: "thesportsdb" as const,
        competition,
        competitionCode:
          TARGETS.find((target) => target.competition === competition)?.code ??
          null,
        externalId: `tsdb:${event.idEvent ?? ""}`,
        kickoff,
        home: event.strHomeTeam ?? "",
        away: event.strAwayTeam ?? "",
      };
    })
    .filter(
      (event) =>
        event.externalId !== "tsdb:" &&
        event.home &&
        event.away &&
        !Number.isNaN(Date.parse(event.kickoff)) &&
        Date.parse(event.kickoff) >= now.getTime() - 6 * 60 * 60 * 1000 &&
        Date.parse(event.kickoff) <= until,
    );
}

export async function fetchFootballDataFixtures(
  competition: string,
  now: Date,
): Promise<ApiFixture[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return [];
  const code = getCompetitionProviderKeys("Fútbol", competition)?.footballData;
  if (!code) return [];

  const from = isoDate(now);
  const to = isoDate(new Date(now.getTime() + WINDOW_DAYS * DAY_MS));
  const json = (await fetchJson(
    `${FD_BASE}/competitions/${code}/matches?dateFrom=${from}&dateTo=${to}`,
    { headers: { "X-Auth-Token": key } },
  )) as { matches?: FdMatch[] };
  return (json.matches ?? []).map((match) => ({
    provider: "football-data" as const,
    competition,
    competitionCode:
      TARGETS.find((target) => target.competition === competition)?.code ??
      null,
    externalId: `fd:${match.id}`,
    kickoff: match.utcDate,
    home: match.homeTeam?.name ?? "",
    away: match.awayTeam?.name ?? "",
  }));
}
