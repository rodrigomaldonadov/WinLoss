import { describe, expect, it } from "vitest";

import type { Ratings } from "@/lib/analysis/model";

import {
  deserializeRatings,
  getRatingsAsOf,
  matchesBeforeWeek,
  serializeRatings,
} from "./ratings";

const match = (id: string, playedAt: string) => ({
  homeTeamId: `home-${id}`,
  awayTeamId: `away-${id}`,
  homeGoals: 1,
  awayGoals: 0,
  playedAt: new Date(playedAt),
});

describe("matchesBeforeWeek", () => {
  it("excluye el mismo día, la misma semana y el futuro", () => {
    const date = new Date("2026-11-11T20:00:00.000Z"); // miércoles
    const rows = [
      match("old", "2026-11-01T12:00:00.000Z"),
      match("monday", "2026-11-09T12:00:00.000Z"),
      match("same-day", "2026-11-11T12:00:00.000Z"),
      match("future", "2026-11-12T12:00:00.000Z"),
    ];
    expect(
      matchesBeforeWeek(rows, date).map((row) => row.homeTeamId),
    ).toEqual(["home-old"]);
  });
});

describe("caché de ratings as-of", () => {
  const ratings: Ratings = {
    teams: new Map([
      ["home", { attack: 0.2, defense: -0.1, matches: 10, weight: 10 }],
    ]),
    homeAdvantage: 0.15,
    rho: -0.02,
    asOf: new Date("2026-11-09T00:00:00.000Z"),
    sample: 10,
    effectiveSample: 8,
    leagueAvgHomeGoals: 1.5,
    leagueAvgAwayGoals: 1.1,
    halfLifeDays: 365,
    ridge: 70,
  };

  it("lee la caché sin reajustar", async () => {
    const calls: string[] = [];
    const client = {
      ratingAsOfCache: {
        findUnique: async () => ({
          ratings: serializeRatings(ratings),
          matchesUsed: 10,
        }),
        upsert: async () => {
          calls.push("upsert");
        },
      },
    } as never;

    const result = await getRatingsAsOf({
      prisma: client,
      competitionCode: "E0",
      date: new Date("2026-11-11T20:00:00.000Z"),
      matches: [],
      modelVersionId: "v1",
      params: {
        halfLifeDays: 365,
        ridge: 70,
        homeAdvantageMode: "fit",
        temperature: 1,
      },
    });

    expect(result.cacheHit).toBe(true);
    expect(result.matchesUsed).toBe(10);
    expect(result.ratings?.homeAdvantage).toBeCloseTo(0.15);
    expect(calls).toEqual([]);
  });

  it("serializa y deserializa sin perder equipos", () => {
    const restored = deserializeRatings(serializeRatings(ratings));
    expect(restored?.teams.get("home")?.attack).toBeCloseTo(0.2);
  });
});
