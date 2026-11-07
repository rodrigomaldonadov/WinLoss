import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchFootballDataResults,
  fetchTsdbResults,
} from "./api";

const now = new Date("2026-11-07T15:00:00.000Z");

function response(payload: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify(payload),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FOOTBALL_DATA_API_KEY;
});

describe("resultados automáticos de APIs", () => {
  it("solo acepta FINISHED de 90 minutos en football-data.org", async () => {
    process.env.FOOTBALL_DATA_API_KEY = "test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          matches: [
            {
              id: 1,
              utcDate: "2026-11-07T12:00:00Z",
              status: "FINISHED",
              homeTeam: { name: "Arsenal" },
              awayTeam: { name: "Chelsea" },
              score: {
                duration: "REGULAR",
                fullTime: { home: 2, away: 1 },
              },
            },
            {
              id: 2,
              utcDate: "2026-11-07T12:00:00Z",
              status: "IN_PLAY",
              homeTeam: { name: "Arsenal" },
              awayTeam: { name: "Chelsea" },
              score: { fullTime: { home: 1, away: 0 } },
            },
            {
              id: 3,
              utcDate: "2026-11-07T12:00:00Z",
              status: "FINISHED",
              homeTeam: { name: "Arsenal" },
              awayTeam: { name: "Chelsea" },
              score: {
                duration: "EXTRA_TIME",
                fullTime: { home: 2, away: 1 },
              },
            },
            {
              id: 4,
              utcDate: "2026-11-07T12:00:00Z",
              status: "POSTPONED",
              homeTeam: { name: "Arsenal" },
              awayTeam: { name: "Chelsea" },
              score: { fullTime: { home: 0, away: 0 } },
            },
          ],
        }),
      ),
    );

    const results = await fetchFootballDataResults("Premier League", now);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      home: "Arsenal",
      away: "Chelsea",
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  it("descarta AET, penales y estados no finales en TheSportsDB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          events: [
            {
              idEvent: "1",
              strHomeTeam: "Arsenal",
              strAwayTeam: "Chelsea",
              strTimestamp: "2026-11-07T12:00:00Z",
              intHomeScore: "2",
              intAwayScore: "1",
              strStatus: "FT",
            },
            {
              idEvent: "2",
              strHomeTeam: "Arsenal",
              strAwayTeam: "Chelsea",
              strTimestamp: "2026-11-07T12:00:00Z",
              intHomeScore: "2",
              intAwayScore: "1",
              strStatus: "AET",
            },
            {
              idEvent: "3",
              strHomeTeam: "Arsenal",
              strAwayTeam: "Chelsea",
              strTimestamp: "2026-11-07T12:00:00Z",
              intHomeScore: "2",
              intAwayScore: "1",
              strStatus: "PEN",
            },
            {
              idEvent: "4",
              strHomeTeam: "Arsenal",
              strAwayTeam: "Chelsea",
              strTimestamp: "2026-11-07T12:00:00Z",
              intHomeScore: "0",
              intAwayScore: "0",
              strStatus: "Postponed",
            },
          ],
        }),
      ),
    );

    const results = await fetchTsdbResults("Premier League", now);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      home: "Arsenal",
      away: "Chelsea",
      homeGoals: 2,
      awayGoals: 1,
    });
  });
});
