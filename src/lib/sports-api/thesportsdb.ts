import "server-only";

import {
  findCompetition,
  getCompetitionProviderKeys,
} from "@/lib/catalogs/competitions";
import {
  FINAL_RESULT_TTL_MS,
  getCached,
  setCached,
  withCache,
  SEARCH_TTL_MS,
} from "./cache";
import { throttle } from "./throttle";
import type {
  ApiEvent,
  ApiEventStatus,
  ApiResult,
  SearchEventsInput,
  SportsDataProvider,
} from "./types";

const PROVIDER = "thesportsdb";
const BASE = "https://www.thesportsdb.com/api/v1/json";
const CUP_LIKE =
  /copa|libertadores|sudamericana|champions|europa|conference|mundial|world cup|euro/i;

function apiKey(): string {
  return process.env.THESPORTSDB_API_KEY ?? "123";
}

type TsdbEvent = {
  idEvent: string;
  strEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strTimestamp?: string;
  dateEvent?: string;
  strTime?: string;
  strStatus?: string;
  strProgress?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strLeague?: string;
};

function mapStatus(event: TsdbEvent): ApiEventStatus {
  const status = `${event.strStatus ?? ""} ${event.strProgress ?? ""}`.toLowerCase();
  if (status.includes("finish")) return "FINISHED";
  if (status.includes("postpon")) return "POSTPONED";
  if (status.includes("cancel")) return "CANCELLED";
  if (status.includes("live") || status.includes("progress")) return "LIVE";
  return "SCHEDULED";
}

function score(value?: string | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function kickoff(event: TsdbEvent): string {
  if (event.strTimestamp) {
    const raw = event.strTimestamp;
    return /Z$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`;
  }
  if (event.dateEvent) {
    return `${event.dateEvent}T${event.strTime ?? "00:00:00"}Z`;
  }
  return new Date().toISOString();
}

function mapEvent(event: TsdbEvent, competition: string): ApiEvent {
  return {
    provider: PROVIDER,
    externalId: `tsdb:${event.idEvent}`,
    sport: "Fútbol",
    competition: event.strLeague ?? competition,
    home: event.strHomeTeam ?? "Local",
    away: event.strAwayTeam ?? "Visitante",
    kickoffUtc: kickoff(event),
    status: mapStatus(event),
    scoreHome: score(event.intHomeScore),
    scoreAway: score(event.intAwayScore),
    autoSettleable: !CUP_LIKE.test(competition),
  };
}

async function tsdbFetch(path: string): Promise<unknown> {
  await throttle(PROVIDER, 350);
  const response = await fetch(`${BASE}/${apiKey()}/${path}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`thesportsdb ${response.status}`);
  return response.json();
}

async function resolveLeagueId(
  competition: string,
  region: string,
): Promise<string | null> {
  const keys = getCompetitionProviderKeys("Fútbol", competition);
  if (keys?.sportsDb && /^\d+$/.test(keys.sportsDb)) return keys.sportsDb;

  const meta = findCompetition("Fútbol", competition);
  const alias = keys?.sportsDb ?? meta?.label ?? competition;
  if (!alias) return null;

  const cacheKey = `${PROVIDER}:league:${region}:${alias}`;
  return withCache(cacheKey, 24 * 60 * 60 * 1000, async () => {
    const tries = [
      `search_all_leagues.php?s=Soccer&c=${encodeURIComponent(region)}`,
      "search_all_leagues.php?s=Soccer",
    ];

    const normalizedAlias = alias.toLowerCase();
    for (const path of tries) {
      try {
        const json = (await tsdbFetch(path)) as {
          countries?: { idLeague: string; strLeague?: string; strLeagueAlternate?: string }[];
        };
        const match = (json.countries ?? []).find((league) => {
          const names = `${league.strLeague ?? ""} ${league.strLeagueAlternate ?? ""}`.toLowerCase();
          return (
            names.includes(normalizedAlias) ||
            normalizedAlias.includes((league.strLeague ?? "").toLowerCase())
          );
        });
        if (match) return match.idLeague;
      } catch {
        // seguimos con el siguiente intento
      }
    }
    return null;
  });
}

function eachDate(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [from];

  const dates: string[] = [];
  for (
    let cursor = start;
    cursor <= end && dates.length < 8;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

export const sportsDbProvider: SportsDataProvider = {
  name: PROVIDER,

  async searchEvents(input: SearchEventsInput): Promise<ApiEvent[]> {
    if (input.sport !== "Fútbol") return [];
    const competition = input.competition ?? "";
    const meta = findCompetition("Fútbol", competition);
    const leagueId = await resolveLeagueId(
      competition,
      meta?.region ?? "International",
    );
    if (!leagueId) return [];

    const cacheKey = `${PROVIDER}:search:${leagueId}:${input.from}:${input.to}`;
    return withCache(cacheKey, SEARCH_TTL_MS, async () => {
      const dates = eachDate(input.from, input.to);
      const batches = await Promise.all(
        dates.map(async (date) => {
          try {
            const json = (await tsdbFetch(
              `eventsday.php?d=${date}&l=${leagueId}`,
            )) as { events?: TsdbEvent[] | null };
            return json.events ?? [];
          } catch {
            return [];
          }
        }),
      );

      const seen = new Set<string>();
      const events: ApiEvent[] = [];
      for (const event of batches.flat()) {
        if (!event?.idEvent || seen.has(event.idEvent)) continue;
        seen.add(event.idEvent);
        events.push(mapEvent(event, competition));
      }
      return events;
    });
  },

  async getEventResult(externalEventId: string): Promise<ApiResult | null> {
    const id = externalEventId.replace(/^tsdb:/, "");
    const cacheKey = `${PROVIDER}:result:${id}`;
    const cached = getCached<ApiResult>(cacheKey);
    if (cached) return cached;

    const json = (await tsdbFetch(`lookupevent.php?id=${id}`)) as {
      events?: TsdbEvent[] | null;
    };
    const event = json.events?.[0];
    if (!event) return null;

    const status = mapStatus(event);
    const league = event.strLeague ?? "";
    const result: ApiResult = {
      status,
      scoreHome: score(event.intHomeScore),
      scoreAway: score(event.intAwayScore),
      autoSettleable: status === "FINISHED" && !CUP_LIKE.test(league),
    };

    if (status === "FINISHED") {
      setCached(cacheKey, result, FINAL_RESULT_TTL_MS);
    }
    return result;
  },
};
