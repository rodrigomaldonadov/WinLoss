import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@prisma/client";

import { getMatchReview } from "./load";

const playedAt = new Date("2026-11-05T20:00:00.000Z");

function client(snapshot: unknown, cacheFindUnique = vi.fn()) {
  return {
    historicalMatch: {
      findUnique: async () => ({
        id: "match-1",
        competition: "Premier League",
        competitionCode: "E0",
        playedAt,
        homeGoals: 2,
        awayGoals: 1,
        odds: null,
        homeTeamId: "arsenal",
        awayTeamId: "chelsea",
        homeTeam: { canonicalName: "Arsenal" },
        awayTeam: { canonicalName: "Chelsea" },
      }),
      findMany: async () => [],
    },
    analysisSnapshot: {
      findMany: async () => (snapshot ? [snapshot] : []),
    },
    modelVersion: { findFirst: async () => null },
    modelEvaluation: { findFirst: async () => null },
    betLeg: { findMany: async () => [] },
    ratingAsOfCache: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
    matchReviewCache: {
      findUnique: cacheFindUnique,
      upsert: async () => ({}),
    },
  } as unknown as PrismaClient;
}

describe("getMatchReview", () => {
  it("prefiere el snapshot guardado sobre una reconstrucción", async () => {
    const cacheFindUnique = vi.fn();
    const snapshot = {
      snapshotAt: new Date("2026-11-05T18:00:00.000Z"),
      kickoff: playedAt,
      finalSource: "model",
      finalProbability: { home: 0.6, draw: 0.25, away: 0.15 },
      modelProbability: { home: 0.6, draw: 0.25, away: 0.15 },
      marketProbability: null,
      markets: {
        home: 0.6,
        draw: 0.25,
        away: 0.15,
        over15: 0.7,
        over25: 0.45,
        over35: 0.2,
        btts: 0.5,
      },
      topScores: [{ home: 2, away: 1, probability: 0.12 }],
      communityAvailable: false,
      communitySample: null,
      communityProbability: null,
      ratingsVersion: "baseline:2026-11-01T00:00:00.000Z",
    };

    const result = await getMatchReview({
      userId: "user-1",
      matchId: "match-1",
      client: client(snapshot, cacheFindUnique),
    });

    expect(result?.mode).toBe("saved");
    expect(result?.warning).toBeNull();
    expect(result?.modelMarkets?.home).toBeCloseTo(0.6);
    expect(result?.cacheHit).toBe(false);
    expect(result?.actualScoreInTop5).toBe(true);
    expect(cacheFindUnique).not.toHaveBeenCalled();
  });

  it("devuelve null si no hay snapshot ni equipo suficiente para reconstruir", async () => {
    const result = await getMatchReview({
      userId: "user-1",
      matchId: "match-1",
      client: client(null),
    });
    expect(result).toBeNull();
  });

  it("usa la reconstrucción cacheada sin reajustar", async () => {
    const findMany = vi.fn(async () => []);
    const cacheFindUnique = vi.fn(async () => ({
      probabilities: {
        model: {
          home: 0.55,
          draw: 0.25,
          away: 0.2,
          over15: 0.7,
          over25: 0.45,
          over35: 0.2,
          btts: 0.5,
        },
        topScores: [{ home: 2, away: 1, probability: 0.12 }],
        ratingsVersion: "baseline:2026-10-26T00:00:00.000Z",
      },
      ratingsAsOf: new Date("2026-10-26T00:00:00.000Z"),
      calculatedAt: new Date("2026-11-01T00:00:00.000Z"),
    }));
    const fake = client(null, cacheFindUnique) as unknown as {
      historicalMatch: { findMany: typeof findMany };
    };
    fake.historicalMatch.findMany = findMany;

    const result = await getMatchReview({
      userId: "user-1",
      matchId: "match-1",
      client: fake as unknown as PrismaClient,
    });

    expect(result?.mode).toBe("reconstructed");
    expect(result?.cacheHit).toBe(true);
    expect(result?.ratingsVersion).toContain("baseline");
    // La comunidad nunca se reconstruye: solo se muestra si el snapshot la guardó.
    expect(result?.community).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("tolera un snapshot antiguo sin mercados ni top-5", async () => {
    const snapshot = {
      snapshotAt: new Date("2026-11-05T18:00:00.000Z"),
      kickoff: playedAt,
      finalSource: "market",
      finalProbability: { home: 0.55, draw: 0.25, away: 0.2 },
      modelProbability: { home: 0.5, draw: 0.3, away: 0.2 },
      marketProbability: { home: 0.55, draw: 0.25, away: 0.2 },
      markets: null,
      topScores: null,
      communityAvailable: null,
      communitySample: null,
      communityProbability: null,
      ratingsVersion: null,
    };

    const result = await getMatchReview({
      userId: "user-1",
      matchId: "match-1",
      client: client(snapshot),
    });

    expect(result?.mode).toBe("saved");
    expect(result?.modelMarkets).toMatchObject({
      home: 0.5,
      draw: 0.3,
      away: 0.2,
      over25: null,
      btts: null,
    });
    expect(result?.topScores).toBeNull();
    expect(result?.actualScoreInTop5).toBeNull();
    expect(result?.community).toBeNull();
    expect(
      result?.rows.find((row) => row.key === "1X2_HOME")?.probabilities,
    ).toMatchObject({ marketClose: 0.55, model: 0.5, final: 0.55 });
    expect(
      result?.rows.find((row) => row.key === "OVER_2.5")?.probabilities.model,
    ).toBeNull();
  });
});
