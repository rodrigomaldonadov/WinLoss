import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@prisma/client";

import type { ApiResult } from "@/lib/analysis/api";

import { API_RESULT_SOURCE, runResultsJob } from "./results-job";

const now = new Date("2026-11-07T15:00:00.000Z");
const kickoff = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();

function result(competition: string): ApiResult {
  return {
    provider: "thesportsdb",
    competition,
    competitionCode: "E0",
    externalId: "tsdb:result-1",
    kickoff,
    home: "Arsenal",
    away: "Chelsea",
    homeGoals: 2,
    awayGoals: 1,
  };
}

function basePrisma(overrides: {
  findUnique?: () => Promise<unknown>;
  findFirst?: () => Promise<unknown>;
  create?: (data: unknown) => Promise<unknown>;
}) {
  return {
    team: {
      findMany: async () => [
        { id: "arsenal", canonicalName: "Arsenal", normalizedName: "arsenal", aliases: [] },
        { id: "chelsea", canonicalName: "Chelsea", normalizedName: "chelsea", aliases: [] },
      ],
      upsert: async ({
        where,
      }: {
        where: { normalizedName: string };
      }) => ({
        id: where.normalizedName.replace(/\s+/g, "-"),
        canonicalName: where.normalizedName,
        normalizedName: where.normalizedName,
      }),
    },
    historicalMatch: {
      findUnique: overrides.findUnique ?? (async () => null),
      findFirst: overrides.findFirst ?? (async () => null),
      create: overrides.create ?? (async () => ({})),
      update: async () => ({}),
    },
  } as unknown as PrismaClient;
}

describe("runResultsJob", () => {
  it("guarda un resultado FINISHED como provisional de API", async () => {
    let created: Record<string, unknown> | null = null;
    const summary = await runResultsJob({
      prisma: basePrisma({
        create: async (value) => {
          created = (value as { data: Record<string, unknown> }).data;
          return {};
        },
      }),
      now,
      aliasesPath: "team-aliases.json",
      throttle: { tsdb: 0, footballData: 0 },
      sleep: async () => {},
      fetchTsdb: async (competition) =>
        competition === "Premier League" ? [result(competition)] : [],
      fetchFootballData: async () => [],
      logger: () => {},
    });

    expect(summary.created).toBe(1);
    expect(created).toMatchObject({
      source: API_RESULT_SOURCE,
      provisional: true,
      homeGoals: 2,
      awayGoals: 1,
      result: "H",
    });
  });

  it("no pisa una fila oficial de CSV", async () => {
    let created = false;
    const summary = await runResultsJob({
      prisma: basePrisma({
        findUnique: async () => ({ id: "official", provisional: false }),
        create: async () => {
          created = true;
          return {};
        },
      }),
      now,
      aliasesPath: "team-aliases.json",
      throttle: { tsdb: 0, footballData: 0 },
      sleep: async () => {},
      fetchTsdb: async (competition) =>
        competition === "Premier League" ? [result(competition)] : [],
      fetchFootballData: async () => [],
      logger: () => {},
    });

    expect(created).toBe(false);
    expect(summary.skippedOfficial).toBe(1);
  });

  it("tolera el fallo de un proveedor y guarda el otro", async () => {
    const previous = process.env.FOOTBALL_DATA_API_KEY;
    process.env.FOOTBALL_DATA_API_KEY = "test";
    let created = 0;
    try {
      const summary = await runResultsJob({
        prisma: basePrisma({
          create: async () => {
            created += 1;
            return {};
          },
        }),
        now,
        aliasesPath: "team-aliases.json",
        throttle: { tsdb: 0, footballData: 0 },
        sleep: async () => {},
        fetchTsdb: async (competition) =>
          competition === "Premier League" ? [result(competition)] : [],
        fetchFootballData: async () => {
          throw new Error("fd caído");
        },
        logger: () => {},
      });

      expect(created).toBe(1);
      expect(summary.ok).toBe(false);
      expect(summary.errors.some((error) => error.includes("fd caído"))).toBe(
        true,
      );
    } finally {
      if (previous === undefined) delete process.env.FOOTBALL_DATA_API_KEY;
      else process.env.FOOTBALL_DATA_API_KEY = previous;
    }
  });

  it("crea el Team cuando el alias explícito existe", async () => {
    let created: Record<string, unknown> | null = null;
    const prisma = {
      team: {
        findMany: async () => [],
        upsert: async ({
          where,
        }: {
          where: { normalizedName: string };
        }) => ({
          id: where.normalizedName,
          canonicalName: where.normalizedName,
          normalizedName: where.normalizedName,
        }),
      },
      historicalMatch: {
        findUnique: async () => null,
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created = data;
          return {};
        },
        update: async () => ({}),
      },
    } as unknown as PrismaClient;

    const summary = await runResultsJob({
      prisma,
      now,
      aliasesPath: "team-aliases.json",
      throttle: { tsdb: 0, footballData: 0 },
      sleep: async () => {},
      fetchTsdb: async (competition) =>
        competition === "Liga 1"
          ? [
              {
                ...result(competition),
                competitionCode: "PER1",
                home: "Atlético Grau",
                away: "Cusco",
              },
            ]
          : [],
      fetchFootballData: async () => [],
      logger: () => {},
    });

    expect(summary.created).toBe(1);
    expect(summary.unresolved).toEqual([]);
    expect(created).toMatchObject({
      homeTeamId: "atletico grau",
      awayTeamId: "cusco",
      source: API_RESULT_SOURCE,
      provisional: true,
    });
  });

  it("no guarda equipos sin alias", async () => {
    let created = false;
    const summary = await runResultsJob({
      prisma: basePrisma({
        create: async () => {
          created = true;
          return {};
        },
      }),
      now,
      aliasesPath: "team-aliases.json",
      throttle: { tsdb: 0, footballData: 0 },
      sleep: async () => {},
      fetchTsdb: async (competition) =>
        competition === "Premier League"
          ? [
              {
                ...result(competition),
                home: "Equipo Sin Alias",
              },
            ]
          : [],
      fetchFootballData: async () => [],
      logger: () => {},
    });

    expect(created).toBe(false);
    expect(summary.unresolved).toContain("Equipo Sin Alias");
  });
});
