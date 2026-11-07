import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@prisma/client";

import { runEvaluationJob } from "./evaluate-job";

const now = new Date("2026-11-07T15:00:00.000Z");
const kickoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);

function snapshot(id: string, snapshotAt: string) {
  return {
    id,
    matchKey: "arsenal|chelsea|2026-11-07",
    competition: "Premier League",
    homeName: "Arsenal",
    awayName: "Chelsea",
    homeTeamId: "arsenal",
    awayTeamId: "chelsea",
    kickoff,
    snapshotAt: new Date(snapshotAt),
    marketProbability: { home: 0.45, draw: 0.3, away: 0.25 },
    modelProbability: { home: 0.5, draw: 0.25, away: 0.25 },
    challengerProbability: { home: 0.55, draw: 0.2, away: 0.25 },
  };
}

function prismaStub(overrides: {
  historical?: unknown;
  legs?: unknown[];
  onUpdate?: (data: Record<string, unknown>) => void;
  onSupersede?: (ids: string[]) => void;
}) {
  return {
    analysisSnapshot: {
      findMany: async () => [
        snapshot("new", "2026-11-07T10:00:00.000Z"),
        snapshot("old", "2026-11-07T08:00:00.000Z"),
      ],
      updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        overrides.onSupersede?.(where.id.in);
        return { count: where.id.in.length };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        overrides.onUpdate?.(data);
        return {};
      },
    },
    historicalMatch: {
      findFirst: async () =>
        overrides.historical === undefined
          ? { homeGoals: 2, awayGoals: 1, source: "football-data.co.uk", provisional: false }
          : overrides.historical,
    },
    betLeg: { findMany: async () => overrides.legs ?? [] },
  } as unknown as PrismaClient;
}

describe("runEvaluationJob", () => {
  it("evalúa el snapshot más reciente y marca el anterior como superseded", async () => {
    const superseded: string[] = [];
    let updateData: Record<string, unknown> | null = null;
    const summary = await runEvaluationJob({
      prisma: prismaStub({
        onSupersede: (ids) => superseded.push(...ids),
        onUpdate: (data) => {
          updateData = data;
        },
      }),
      now,
      logger: () => {},
    });

    expect(summary.evaluated).toBe(1);
    expect(summary.superseded).toBe(1);
    expect(superseded).toEqual(["old"]);
    expect(updateData).toMatchObject({
      result: "H",
      outcome: 0,
      homeGoals: 2,
      awayGoals: 1,
      resultSource: "football-data.co.uk",
    });
    const metrics = updateData as {
      modelBrier?: number;
      marketBrier?: number;
      challengerBrier?: number;
    } | null;
    expect(metrics?.modelBrier).toBeGreaterThan(0);
    expect(metrics?.marketBrier).toBeGreaterThan(0);
    expect(metrics?.challengerBrier).toBeGreaterThan(0);
  });

  it("usa BetLeg como respaldo cuando no hay HistoricalMatch", async () => {
    let updateData: Record<string, unknown> | null = null;
    await runEvaluationJob({
      prisma: prismaStub({
        historical: null,
        legs: [
          {
            homeTeam: "Chelsea",
            awayTeam: "Arsenal",
            eventName: "Chelsea vs Arsenal",
            scoreHome: 1,
            scoreAway: 2,
          },
        ],
        onUpdate: (data) => {
          updateData = data;
        },
      }),
      now,
      logger: () => {},
    });

    expect(updateData).toMatchObject({
      result: "H",
      homeGoals: 2,
      awayGoals: 1,
      resultSource: "betleg",
    });
  });

  it("deja pendiente el partido si todavía no hay resultado", async () => {
    let updates = 0;
    const summary = await runEvaluationJob({
      prisma: prismaStub({
        historical: null,
        legs: [],
        onUpdate: () => {
          updates += 1;
        },
      }),
      now,
      logger: () => {},
    });

    expect(summary.withoutResult).toBe(1);
    expect(summary.evaluated).toBe(0);
    expect(updates).toBe(0);
  });
});
