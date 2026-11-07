import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@prisma/client";

import {
  HISTORICAL_SOURCE,
  parseAnalysisFile,
} from "@/lib/analysis/import";

import { runImportJob } from "./import-job";
import { resultDedupeKey } from "./result-dedupe";

const HEADER =
  "Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HS,AS,HST,AST,HC,AC,HY,AY,HR,AR,AvgH,AvgD,AvgA,AvgCH,AvgCD,AvgCA,Avg>2.5,Avg<2.5,AvgC>2.5,AvgC<2.5";
const CSV = `${HEADER}
E0,01/08/2026,20:00,Arsenal,Chelsea,2,1,H,10,8,5,4,6,5,2,3,0,0,1.8,3.5,4.2,1.75,3.6,4,2.1,1.7,2,1.8`;

describe("runImportJob · temporada en curso", () => {
  it("actualiza marcador y cuota de cierre en filas existentes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "winloss-update-"));
    const seasonDir = join(dir, "england", "26-27");
    mkdirSync(seasonDir, { recursive: true });
    const full = join(seasonDir, "E0.csv");
    writeFileSync(full, CSV, "utf8");
    const path = relative(process.cwd(), full).replace(/\\/g, "/");

    const parsed = parseAnalysisFile(CSV, path);
    const row = parsed.rows[0]!;
    const dedupeKey = resultDedupeKey({
      competition: row.competition.competition,
      competitionCode: row.competition.code,
      playedAt: row.playedAt,
      homeTeamId: "home",
      awayTeamId: "away",
    });
    const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> =
      [];

    const prisma = {
      analysisImportFile: {
        findMany: async () => [],
        update: async () => {},
        upsert: async () => {},
      },
      team: {
        upsert: async ({
          where,
        }: {
          where: { normalizedName: string };
        }) => ({
          id: where.normalizedName.includes("arsenal") ? "home" : "away",
        }),
      },
      teamAlias: { upsert: async () => {} },
      resultDiscrepancy: { create: async () => ({}) },
      historicalMatch: {
        findMany: async (args: { where?: { provisional?: boolean } }) => {
          if (args.where?.provisional === true) return [];
          return [
            {
              id: "existing-row",
              competition: row.competition.competition,
              competitionCode: row.competition.code,
              season: row.season,
              seasonStart: row.seasonStart,
              playedAt: row.playedAt,
              homeTeamId: "home",
              awayTeamId: "away",
              homeGoals: 1,
              awayGoals: 0,
              result: "H",
              odds: { pre: { home: 1.8, draw: 3.5, away: 4.2 } },
              stats: null,
              dedupeKey,
              provisional: false,
            },
          ];
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          updates.push({ where, data });
        },
        createMany: async () => ({ count: 0 }),
      },
    } as unknown as PrismaClient;

    try {
      const summary = await runImportJob({
        prisma,
        dataDir: dir,
        aliasesPath: "team-aliases.json",
        now: new Date("2026-11-07T12:00:00.000Z"),
        logger: () => {},
      });

      expect(summary.historical.updated).toBe(1);
      expect(summary.historical.created).toBe(0);
      expect(updates).toHaveLength(1);
      expect(updates[0]?.where.id).toBe("existing-row");
      expect(updates[0]?.data.homeGoals).toBe(2);
      expect(updates[0]?.data.awayGoals).toBe(1);
      expect(updates[0]?.data.odds).toMatchObject({
        pre: { home: 1.8, draw: 3.5, away: 4.2 },
        closing: { home: 1.75, draw: 3.6, away: 4 },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reemplaza una fila provisional de API y registra la discrepancia", async () => {
    const dir = mkdtempSync(join(tmpdir(), "winloss-replace-"));
    const seasonDir = join(dir, "england", "26-27");
    mkdirSync(seasonDir, { recursive: true });
    const full = join(seasonDir, "E0.csv");
    writeFileSync(full, CSV, "utf8");
    const path = relative(process.cwd(), full).replace(/\\/g, "/");
    const parsed = parseAnalysisFile(CSV, path);
    const row = parsed.rows[0]!;
    const dedupeKey = resultDedupeKey({
      competition: row.competition.competition,
      competitionCode: row.competition.code,
      playedAt: row.playedAt,
      homeTeamId: "home",
      awayTeamId: "away",
    });

    let updateData: Record<string, unknown> | null = null;
    let discrepancy: Record<string, unknown> | null = null;

    const provisional = {
      id: "provisional-row",
      dedupeKey,
      competition: row.competition.competition,
      competitionCode: row.competition.code,
      season: row.season,
      seasonStart: row.seasonStart,
      playedAt: row.playedAt,
      homeTeamId: "home",
      awayTeamId: "away",
      homeGoals: 1,
      awayGoals: 1,
      result: "D",
      odds: null,
      stats: null,
      source: "api",
      provisional: true,
    };

    const prisma = {
      analysisImportFile: {
        findMany: async () => [],
        update: async () => {},
        upsert: async () => {},
      },
      team: {
        upsert: async ({
          where,
        }: {
          where: { normalizedName: string };
        }) => ({
          id: where.normalizedName.includes("arsenal") ? "home" : "away",
        }),
      },
      teamAlias: { upsert: async () => {} },
      resultDiscrepancy: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          discrepancy = data;
          return {};
        },
      },
      historicalMatch: {
        findMany: async (args: { where?: { provisional?: boolean } }) =>
          args.where?.provisional === true ? [provisional] : [],
        findFirst: async () => null,
        update: async ({
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          updateData = data;
        },
        delete: async () => {},
        createMany: async () => ({ count: 0 }),
      },
    } as unknown as PrismaClient;

    try {
      const summary = await runImportJob({
        prisma,
        dataDir: dir,
        aliasesPath: "team-aliases.json",
        now: new Date("2026-11-07T12:00:00.000Z"),
        logger: () => {},
      });

      expect(summary.historical.updated).toBe(1);
      expect(updateData).toMatchObject({
        source: HISTORICAL_SOURCE,
        provisional: false,
        homeGoals: 2,
        awayGoals: 1,
        result: "H",
      });
      expect(discrepancy).toMatchObject({
        dedupeKey,
        csvHomeGoals: 2,
        csvAwayGoals: 1,
        apiHomeGoals: 1,
        apiAwayGoals: 1,
        resolvedBy: "csv",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
