import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@prisma/client";

import type { ApiFixture } from "@/lib/analysis/api";

import { runSyncJob } from "./sync-job";

const DAY_MS = 86_400_000;
const now = new Date("2026-11-07T12:00:00.000Z");
const kickoff = new Date(now.getTime() + DAY_MS).toISOString();

function fixture(competition: string): ApiFixture {
  return {
    provider: "thesportsdb",
    competition,
    competitionCode: "E0",
    externalId: "tsdb:1",
    kickoff,
    home: "Arsenal",
    away: "Chelsea",
  };
}

function prismaStub(onTransaction: () => void): PrismaClient {
  return {
    team: { findMany: async () => [] },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      onTransaction();
      return callback({
        upcomingFixture: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async () => ({ count: 1 }),
        },
        fixtureBatch: {
          deleteMany: async () => ({ count: 0 }),
          create: async () => ({ id: "batch-test" }),
        },
      });
    },
  } as unknown as PrismaClient;
}

describe("runSyncJob", () => {
  it("tolera el fallo de un proveedor y guarda el que sí responde", async () => {
    const previous = process.env.FOOTBALL_DATA_API_KEY;
    process.env.FOOTBALL_DATA_API_KEY = "test";
    let transactions = 0;

    try {
      const summary = await runSyncJob({
        prisma: prismaStub(() => {
          transactions += 1;
        }),
        now,
        aliasesPath: "team-aliases.json",
        throttle: { tsdb: 0, footballData: 0 },
        sleep: async () => {},
        fetchTsdb: async (competition) =>
          competition === "Premier League" ? [fixture(competition)] : [],
        fetchFootballData: async () => {
          throw new Error("proveedor caído");
        },
        logger: () => {},
      });

      expect(summary.ok).toBe(false);
      expect(summary.skipped).toBe(false);
      expect(summary.fixtures).toBe(1);
      expect(summary.providers).toEqual([
        { provider: "thesportsdb", competitions: 8, fixtures: 1 },
      ]);
      expect(summary.errors.some((error) => error.includes("proveedor caído"))).toBe(
        true,
      );
      expect(transactions).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.FOOTBALL_DATA_API_KEY;
      else process.env.FOOTBALL_DATA_API_KEY = previous;
    }
  });

  it("no toca la base si todos los proveedores fallan", async () => {
    const previous = process.env.FOOTBALL_DATA_API_KEY;
    process.env.FOOTBALL_DATA_API_KEY = "test";
    let transactions = 0;

    try {
      const summary = await runSyncJob({
        prisma: prismaStub(() => {
          transactions += 1;
        }),
        now,
        aliasesPath: "team-aliases.json",
        throttle: { tsdb: 0, footballData: 0 },
        sleep: async () => {},
        fetchTsdb: async () => {
          throw new Error("tsdb caído");
        },
        fetchFootballData: async () => {
          throw new Error("fd caído");
        },
        logger: () => {},
      });

      expect(summary.ok).toBe(false);
      expect(summary.skipped).toBe(true);
      expect(summary.providers).toEqual([]);
      expect(transactions).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.FOOTBALL_DATA_API_KEY;
      else process.env.FOOTBALL_DATA_API_KEY = previous;
    }
  });
});
