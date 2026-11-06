import "server-only";

import type {
  ApiEvent,
  ApiResult,
  SearchEventsInput,
  SportsDataProvider,
} from "./types";

const finished = (home: number, away: number): ApiResult => ({
  status: "FINISHED",
  scoreHome: home,
  scoreAway: away,
  autoSettleable: true,
});

const RESULTS: Record<string, ApiResult> = {
  "fake:match-1": finished(2, 1),
  "fake:match-2": finished(1, 1),
  "fake:postponed": {
    status: "POSTPONED",
    scoreHome: null,
    scoreAway: null,
    autoSettleable: false,
  },
};

function event(
  id: string,
  home: string,
  away: string,
  status: ApiEvent["status"],
  hoursFromNow: number,
): ApiEvent {
  const result = RESULTS[`fake:${id}`];
  return {
    provider: "fake",
    externalId: `fake:${id}`,
    sport: "Fútbol",
    competition: "Liga 1",
    home,
    away,
    kickoffUtc: new Date(Date.now() + hoursFromNow * 3_600_000).toISOString(),
    status,
    scoreHome: result?.scoreHome ?? null,
    scoreAway: result?.scoreAway ?? null,
    autoSettleable: result?.autoSettleable ?? true,
  };
}

/** Proveedor determinista para tests/E2E (nunca se usa en búsquedas reales). */
export const fakeProvider: SportsDataProvider = {
  name: "fake",
  async searchEvents(input: SearchEventsInput): Promise<ApiEvent[]> {
    if (input.sport !== "Fútbol") return [];
    if (input.competition && input.competition !== "Liga 1") return [];
    return [
      event("match-1", "PSG", "Marsella", "FINISHED", -2),
      event("match-2", "Real Madrid", "Barcelona", "FINISHED", -3),
      event("postponed", "Alianza Lima", "Universitario", "POSTPONED", 4),
    ];
  },
  async getEventResult(externalEventId: string): Promise<ApiResult | null> {
    return RESULTS[externalEventId] ?? null;
  },
};
