import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import type { PrismaClient } from "@prisma/client";

import { runImportJob } from "./import-job";
import { hashFile, isContentChanged, needsHashCheck } from "./incremental";

describe("detección incremental", () => {
  const state = {
    size: 10,
    mtime: new Date("2026-11-07T10:00:00.000Z"),
    hash: "abc",
  };

  it("no vuelve a leer si tamaño y mtime coinciden", () => {
    expect(
      needsHashCheck(
        { size: 10, mtime: new Date("2026-11-07T10:00:00.000Z") },
        state,
      ),
    ).toBe(false);
  });

  it("detecta cambios reales por hash", () => {
    expect(
      needsHashCheck(
        { size: 10, mtime: new Date("2026-11-07T10:01:00.000Z") },
        state,
      ),
    ).toBe(true);
    expect(
      isContentChanged({ size: 10, hash: "abc" }, state),
    ).toBe(false);
    expect(
      isContentChanged({ size: 10, hash: "def" }, state),
    ).toBe(true);
  });
});

describe("runImportJob", () => {
  it("termina sin procesar si los archivos no cambiaron", async () => {
    const dir = mkdtempSync(join(tmpdir(), "winloss-import-"));
    const file = join(dir, "E0.csv");
    writeFileSync(file, "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG\n", "utf8");

    const stat = statSync(file);
    const path = relative(process.cwd(), file).replace(/\\/g, "/");
    const calls: string[] = [];

    const prisma = {
      analysisImportFile: {
        findMany: async () => [
          {
            path,
            size: stat.size,
            mtime: stat.mtime,
            hash: hashFile(file),
          },
        ],
        update: async () => {
          calls.push("update");
        },
        upsert: async () => {
          calls.push("upsert");
        },
      },
    } as unknown as PrismaClient;

    try {
      const summary = await runImportJob({
        prisma,
        dataDir: dir,
        aliasesPath: "team-aliases.json",
        logger: (message) => calls.push(message),
      });

      expect(summary.changedFiles).toBe(0);
      expect(summary.skippedFiles).toBe(1);
      expect(summary.historical.created).toBe(0);
      expect(summary.ok).toBe(true);
      expect(calls).not.toContain("upsert");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
