import "server-only";

import { getCompetitionProviderKeys } from "@/lib/catalogs/competitions";
import { FINAL_RESULT_TTL_MS, getCached, setCached, withCache, SEARCH_TTL_MS } from "./cache";
import { throttle } from "./throttle";
import type {
  ApiEvent,
  ApiEventStatus,
  ApiResult,
  SearchEventsInput,
  SportsDataProvider,
} from "./types";

const BASE = "https://api.football-data.org/v4";
const PROVIDER = "football-data";

type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage?: string;
  competition?: { name?: string };
  homeTeam?: { name?: string | null };
  awayTeam?: { name?: string | null };
  score?: {
    fullTime?: { home: number | null; away: number | null };
    regularTime?: { home: number | null; away: number | null } | null;
  };
};

function mapStatus(status: string): ApiEventStatus {
  switch (status) {
    case "FINISHED":
    case "AWARDED":
      return "FINISHED";
    case "IN_PLAY":
    case "PAUSED":
    case "LIVE":
      return "LIVE";
    case "POSTPONED":
    case "SUSPENDED":
      return "POSTPONED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "SCHEDULED";
  }
}

function toResult(match: FdMatch): ApiResult {
  const regular = match.score?.regularTime ?? null;
  const full = match.score?.fullTime ?? null;
  const score = regular ?? full;
  const isFinished = mapStatus(match.status) === "FINISHED";
  const leagueStage =
    match.stage === "REGULAR_SEASON" || match.stage === "GROUP_STAGE";

  return {
    status: mapStatus(match.status),
    scoreHome: score?.home ?? null,
    scoreAway: score?.away ?? null,
    // Si el proveedor distingue el 90' (regularTime) o es fase de liga, es liquidable.
    autoSettleable: isFinished && Boolean(regular || leagueStage),
  };
}

function mapMatch(match: FdMatch, competitionFallback: string): ApiEvent {
  const regular = match.score?.regularTime ?? null;
  const full = match.score?.fullTime ?? null;
  const score = regular ?? full;
  const leagueStage =
    match.stage === "REGULAR_SEASON" || match.stage === "GROUP_STAGE";

  return {
    provider: PROVIDER,
    externalId: `fd:${match.id}`,
    sport: "Fútbol",
    competition: match.competition?.name ?? competitionFallback,
    home: match.homeTeam?.name ?? "Local",
    away: match.awayTeam?.name ?? "Visitante",
    kickoffUtc: match.utcDate,
    status: mapStatus(match.status),
    scoreHome: score?.home ?? null,
    scoreAway: score?.away ?? null,
    autoSettleable: Boolean(regular || leagueStage),
  };
}

async function fdFetch(path: string): Promise<unknown> {
  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) throw new Error("Falta FOOTBALL_DATA_API_KEY");

  await throttle(PROVIDER, 6_500);

  const response = await fetch(`${BASE}${path}`, {
    headers: { "X-Auth-Token": token },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`football-data ${response.status}`);
  }

  return response.json();
}

export const footballDataProvider: SportsDataProvider = {
  name: PROVIDER,

  async searchEvents(input: SearchEventsInput): Promise<ApiEvent[]> {
    if (input.sport !== "Fútbol") return [];

    const keys = getCompetitionProviderKeys(
      "Fútbol",
      input.competition ?? "",
    );
    const code = keys?.footballData;

    // football-data solo cubre las 12 competiciones del plan gratuito.
    if (!code) return [];

    const cacheKey = `${PROVIDER}:search:${code}:${input.from}:${input.to}`;
    return withCache(cacheKey, SEARCH_TTL_MS, async () => {
      const json = (await fdFetch(
        `/competitions/${code}/matches?dateFrom=${input.from}&dateTo=${input.to}`,
      )) as { matches?: FdMatch[] };

      return (json.matches ?? []).map((match) =>
        mapMatch(match, input.competition ?? ""),
      );
    });
  },

  async getEventResult(externalEventId: string): Promise<ApiResult | null> {
    const id = externalEventId.replace(/^fd:/, "");
    const cacheKey = `${PROVIDER}:result:${id}`;
    const cached = getCached<ApiResult>(cacheKey);
    if (cached) return cached;

    const json = (await fdFetch(`/matches/${id}`)) as { match?: FdMatch };
    if (!json.match) return null;

    const result = toResult(json.match);
    if (result.status === "FINISHED") {
      setCached(cacheKey, result, FINAL_RESULT_TTL_MS);
    }
    return result;
  },
};
