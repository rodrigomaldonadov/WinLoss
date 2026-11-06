import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeProvider } from "./fake";
import { footballDataProvider } from "./football-data";
import { sportsDbProvider } from "./thesportsdb";

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

function mockFetch(handler: (url: string) => unknown) {
  const fn = vi.fn(async (input: RequestInfo | URL) =>
    jsonResponse(handler(String(input))),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.SPORTS_API_THROTTLE_MS = "0";
  process.env.FOOTBALL_DATA_API_KEY = "test-key";
  process.env.THESPORTSDB_API_KEY = "123";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("football-data · normalización", () => {
  it("mapea estado, marcador y si es liquidable", async () => {
    mockFetch(() => ({
      matches: [
        {
          id: 9001,
          utcDate: "2030-05-01T18:00:00Z",
          status: "FINISHED",
          stage: "REGULAR_SEASON",
          competition: { name: "Premier League" },
          homeTeam: { name: "Arsenal" },
          awayTeam: { name: "Chelsea" },
          score: {
            fullTime: { home: 2, away: 1 },
            regularTime: null,
          },
        },
        {
          id: 9002,
          utcDate: "2030-05-01T20:00:00Z",
          status: "POSTPONED",
          stage: "REGULAR_SEASON",
          competition: { name: "Premier League" },
          homeTeam: { name: "Liverpool" },
          awayTeam: { name: "Everton" },
          score: { fullTime: { home: null, away: null } },
        },
      ],
    }));

    const events = await footballDataProvider.searchEvents({
      sport: "Fútbol",
      competition: "Premier League",
      from: "2030-05-01",
      to: "2030-05-01",
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      provider: "football-data",
      externalId: "fd:9001",
      home: "Arsenal",
      away: "Chelsea",
      status: "FINISHED",
      scoreHome: 2,
      scoreAway: 1,
      autoSettleable: true,
    });
    expect(events[1]?.status).toBe("POSTPONED");
  });

  it("no marca liquidable una copa sin marcador de 90'", async () => {
    mockFetch(() => ({
      match: {
        id: 9003,
        utcDate: "2030-05-02T18:00:00Z",
        status: "FINISHED",
        stage: "ROUND_OF_16",
        competition: { name: "Champions League" },
        homeTeam: { name: "A" },
        awayTeam: { name: "B" },
        score: {
          fullTime: { home: 3, away: 2 },
          regularTime: null,
        },
      },
    }));

    const result = await footballDataProvider.getEventResult("fd:9003");
    expect(result).toMatchObject({
      status: "FINISHED",
      scoreHome: 3,
      scoreAway: 2,
      autoSettleable: false,
    });
  });
});

describe("TheSportsDB · normalización", () => {
  it("mapea un partido finalizado", async () => {
    mockFetch(() => ({
      events: [
        {
          idEvent: "7001",
          strHomeTeam: "Alianza Lima",
          strAwayTeam: "Universitario",
          strLeague: "Peruvian Primera Division",
          strStatus: "Match Finished",
          intHomeScore: "2",
          intAwayScore: "1",
        },
      ],
    }));

    const result = await sportsDbProvider.getEventResult("tsdb:7001");
    expect(result).toMatchObject({
      status: "FINISHED",
      scoreHome: 2,
      scoreAway: 1,
      autoSettleable: true,
    });
  });

  it("no liquida un evento pospuesto", async () => {
    mockFetch(() => ({
      events: [
        {
          idEvent: "7002",
          strHomeTeam: "A",
          strAwayTeam: "B",
          strStatus: "Postponed",
        },
      ],
    }));

    const result = await sportsDbProvider.getEventResult("tsdb:7002");
    expect(result).toMatchObject({
      status: "POSTPONED",
      scoreHome: null,
      scoreAway: null,
      autoSettleable: false,
    });
  });

  it("mantiene marcador ausente como null", async () => {
    mockFetch(() => ({
      events: [
        {
          idEvent: "7003",
          strHomeTeam: "A",
          strAwayTeam: "B",
          strLeague: "Peruvian Primera Division",
          strStatus: "Match Finished",
        },
      ],
    }));

    const result = await sportsDbProvider.getEventResult("tsdb:7003");
    expect(result).toMatchObject({
      status: "FINISHED",
      scoreHome: null,
      scoreAway: null,
    });
  });
});

describe("proveedor fake (tests/E2E)", () => {
  it("devuelve eventos y resultados deterministas", async () => {
    const events = await fakeProvider.searchEvents({
      sport: "Fútbol",
      competition: "Liga 1",
      from: "2030-01-01",
      to: "2030-01-01",
    });
    expect(events.length).toBeGreaterThanOrEqual(3);

    const result = await fakeProvider.getEventResult("fake:match-1");
    expect(result).toMatchObject({
      status: "FINISHED",
      scoreHome: 2,
      scoreAway: 1,
      autoSettleable: true,
    });
  });
});
