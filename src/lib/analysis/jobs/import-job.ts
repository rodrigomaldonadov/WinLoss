import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { Prisma, type PrismaClient } from "@prisma/client";

import { decodeCsvBuffer } from "@/lib/analysis/csv";
import {
  FIXTURE_MAX_AGE_MS,
  FIXTURE_SOURCE,
  HISTORICAL_SOURCE,
  parseAnalysisFile,
  resolveTeamName,
  type FixtureRow,
} from "@/lib/analysis/import";
import {
  isTeamAliasesFile,
  normalizeTeamName,
  suggestTeamAliases,
  type TeamAliasesFile,
} from "@/lib/analysis/team-names";

import {
  hashFile,
  isContentChanged,
  needsHashCheck,
} from "./incremental";

const CHUNK_SIZE = 1_000;

type Logger = (message: string) => void;

type FileEntry = {
  full: string;
  relative: string;
  size: number;
  mtime: Date;
  hash: string;
};

type HistoricalStats = {
  file: string;
  rows: number;
  created: number;
  existing: number;
  old: number;
  invalid: number;
  missingScore: number;
  duplicatesInFile: number;
  unresolved: string[];
};

export type ImportJobSummary = {
  ok: boolean;
  timedOut: boolean;
  files: number;
  changedFiles: number;
  skippedFiles: number;
  historical: {
    files: number;
    rows: number;
    created: number;
    existing: number;
    old: number;
    invalid: number;
    missingScore: number;
    duplicates: number;
  };
  fixtures: {
    file: string;
    capturedAt: string;
    rows: number;
    withOdds: number;
    stale: boolean;
    unresolved: string[];
  } | null;
  unresolved: string[];
  errors: string[];
  durationMs: number;
};

function walk(dir: string): Omit<FileEntry, "hash">[] {
  const entries: Omit<FileEntry, "hash">[] = [];
  const visit = (current: string) => {
    for (const item of readdirSync(/* turbopackIgnore: true */ current, {
      withFileTypes: true,
    })) {
      if (item.name.startsWith(".")) continue;
      const full = join(current, item.name);
      if (item.isDirectory()) {
        visit(full);
      } else if (item.isFile() && item.name.toLowerCase().endsWith(".csv")) {
        const stat = statSync(/* turbopackIgnore: true */ full);
        entries.push({
          full,
          relative: relative(process.cwd(), full).replace(/\\/g, "/"),
          size: stat.size,
          mtime: stat.mtime,
        });
      }
    }
  };
  visit(dir);
  return entries.sort((a, b) => a.relative.localeCompare(b.relative));
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function readAliases(aliasesPath: string): TeamAliasesFile {
  if (!existsSync(/* turbopackIgnore: true */ aliasesPath)) {
    throw new Error(`No existe ${aliasesPath}`);
  }
  const aliasJson = JSON.parse(
    readFileSync(/* turbopackIgnore: true */ aliasesPath, "utf8"),
  );
  if (!isTeamAliasesFile(aliasJson)) {
    throw new Error("team-aliases.json no tiene el formato esperado.");
  }
  return { version: aliasJson.version ?? 1, teams: aliasJson.teams };
}

function emptySummary(
  startedAt: number,
  files: number,
  skippedFiles: number,
): ImportJobSummary {
  return {
    ok: true,
    timedOut: false,
    files,
    changedFiles: 0,
    skippedFiles,
    historical: {
      files: 0,
      rows: 0,
      created: 0,
      existing: 0,
      old: 0,
      invalid: 0,
      missingScore: 0,
      duplicates: 0,
    },
    fixtures: null,
    unresolved: [],
    errors: [],
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Importa solo archivos nuevos o modificados. Los CSV históricos se agregan
 * con `skipDuplicates`; el lote de fixtures más nuevo reemplaza al anterior.
 * Nunca hace red: la descarga de football-data.co.uk es manual.
 */
export async function runImportJob({
  prisma,
  dataDir = process.env.ANALYSIS_DATA_DIR ?? "data-football",
  aliasesPath = process.env.TEAM_ALIASES_FILE ?? "team-aliases.json",
  now = new Date(),
  deadline = Number.POSITIVE_INFINITY,
  force = false,
  logger = () => {},
}: {
  prisma: PrismaClient;
  dataDir?: string;
  aliasesPath?: string;
  now?: Date;
  deadline?: number;
  force?: boolean;
  logger?: Logger;
}): Promise<ImportJobSummary> {
  const startedAt = Date.now();
  const aliases = readAliases(aliasesPath);
  const aliasKeys = Object.keys(aliases.teams);
  const input = resolve(/* turbopackIgnore: true */ dataDir);

  if (!existsSync(/* turbopackIgnore: true */ input)) {
    throw new Error(`No existe la ruta ${input}`);
  }

  const inputStat = statSync(/* turbopackIgnore: true */ input);
  const discovered = inputStat.isDirectory()
    ? walk(input)
    : [
        {
          full: input,
          relative: relative(process.cwd(), input).replace(/\\/g, "/"),
          size: inputStat.size,
          mtime: inputStat.mtime,
        },
      ];

  const states = await prisma.analysisImportFile.findMany({
    select: { path: true, size: true, mtime: true, hash: true },
  });
  const stateByPath = new Map(states.map((state) => [state.path, state]));

  const changed: FileEntry[] = [];
  let skippedFiles = 0;

  for (const file of discovered) {
    if (Date.now() >= deadline) {
      break;
    }
    const state = stateByPath.get(file.relative);
    if (!force && state && !needsHashCheck(file, state)) {
      skippedFiles += 1;
      continue;
    }

    const hash = hashFile(file.full);
    if (!force && state && !isContentChanged({ ...file, hash }, state)) {
      await prisma.analysisImportFile.update({
        where: { path: file.relative },
        data: { size: file.size, mtime: file.mtime, hash },
      });
      skippedFiles += 1;
      continue;
    }

    changed.push({ ...file, hash });
  }

  if (changed.length === 0) {
    logger(
      `[import] sin cambios: ${skippedFiles}/${discovered.length} archivos ya procesados`,
    );
    return emptySummary(startedAt, discovered.length, skippedFiles);
  }

  const teamCache = new Map<string, string>();
  const aliasDone = new Set<string>();
  const unresolved = new Set<string>();
  const errors: string[] = [];
  let timedOut = false;

  async function teamIdFor(rawName: string): Promise<string | null> {
    const canonical = resolveTeamName(rawName, aliases);
    if (!canonical) {
      unresolved.add(rawName);
      return null;
    }
    const normalizedCanonical = normalizeTeamName(canonical);
    if (!normalizedCanonical) return null;
    let teamId = teamCache.get(canonical);
    if (!teamId) {
      const team = await prisma.team.upsert({
        where: { normalizedName: normalizedCanonical },
        create: {
          canonicalName: canonical,
          normalizedName: normalizedCanonical,
        },
        update: { canonicalName: canonical },
        select: { id: true },
      });
      teamId = team.id;
      teamCache.set(canonical, teamId);
    }
    const aliasKey = normalizeTeamName(rawName);
    if (aliasKey && !aliasDone.has(aliasKey)) {
      await prisma.teamAlias.upsert({
        where: { normalized: aliasKey },
        create: { teamId, alias: rawName, normalized: aliasKey },
        update: { teamId, alias: rawName },
        select: { id: true },
      });
      aliasDone.add(aliasKey);
    }
    return teamId;
  }

  const historicalStats: HistoricalStats[] = [];
  const fixtureCandidates: {
    parsed: ReturnType<typeof parseAnalysisFile>;
    file: FileEntry;
  }[] = [];

  for (const entry of changed) {
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }

    let text: string;
    let encoding: string;
    try {
      const decoded = decodeCsvBuffer(
        readFileSync(/* turbopackIgnore: true */ entry.full),
      );
      text = decoded.text;
      encoding = decoded.encoding;
    } catch (error) {
      errors.push(`${entry.relative}: no se pudo leer (${String(error)})`);
      logger(`[skip] ${entry.relative}: no se pudo leer`);
      continue;
    }

    const parsed = parseAnalysisFile(text, entry.relative, encoding);
    if (parsed.format === "unsupported") {
      errors.push(`${entry.relative}: formato no reconocido`);
      logger(`[skip] ${entry.relative}: formato no reconocido`);
      continue;
    }
    if (parsed.format === "fixtures") {
      fixtureCandidates.push({ parsed, file: entry });
      continue;
    }

    try {
      const records: Prisma.HistoricalMatchCreateManyInput[] = [];
      const unresolvedBefore = new Set(unresolved);
      for (const row of parsed.rows) {
        if (Date.now() >= deadline) {
          timedOut = true;
          break;
        }
        const homeTeamId = await teamIdFor(row.homeName);
        const awayTeamId = await teamIdFor(row.awayName);
        if (!homeTeamId || !awayTeamId) continue;

        records.push({
          source: HISTORICAL_SOURCE,
          competition: row.competition.competition,
          competitionCode: row.competition.code,
          season: row.season,
          seasonStart: row.seasonStart,
          playedAt: row.playedAt,
          homeTeamId,
          awayTeamId,
          homeGoals: row.homeGoals,
          awayGoals: row.awayGoals,
          result: row.result,
          odds: (row.odds as Prisma.InputJsonValue | null) ?? undefined,
          stats: (row.stats as Prisma.InputJsonValue | null) ?? undefined,
        });
      }

      if (timedOut) {
        logger(`[import] ${entry.relative}: detenido por límite de tiempo`);
        break;
      }

      let created = 0;
      for (const piece of chunk(records, CHUNK_SIZE)) {
        if (Date.now() >= deadline) {
          timedOut = true;
          break;
        }
        const result = await prisma.historicalMatch.createMany({
          data: piece,
          skipDuplicates: true,
        });
        created += result.count;
      }

      if (timedOut) {
        logger(`[import] ${entry.relative}: detenido por límite de tiempo`);
        break;
      }

      const existing = records.length - created;
      historicalStats.push({
        file: entry.relative,
        rows: parsed.rows.length,
        created,
        existing,
        old: parsed.skippedOld,
        invalid: parsed.skippedInvalid,
        missingScore: parsed.skippedMissingScore,
        duplicatesInFile: parsed.duplicatesInFile,
        unresolved: [...unresolved].filter((name) => !unresolvedBefore.has(name)),
      });

      await prisma.analysisImportFile.upsert({
        where: { path: entry.relative },
        create: {
          path: entry.relative,
          kind: "historical",
          size: entry.size,
          mtime: entry.mtime,
          hash: entry.hash,
          processedAt: now,
        },
        update: {
          kind: "historical",
          size: entry.size,
          mtime: entry.mtime,
          hash: entry.hash,
          processedAt: now,
        },
      });

      logger(
        `[historical] ${entry.relative} | leídas ${parsed.rows.length} | nuevas ${created} | existentes ${existing} | antiguas ${parsed.skippedOld} | inválidas ${parsed.skippedInvalid} | sin marcador ${parsed.skippedMissingScore} | duplicadas ${parsed.duplicatesInFile}`,
      );
    } catch (error) {
      errors.push(`${entry.relative}: ${String(error)}`);
      logger(`[import] ${entry.relative}: falló (${String(error)})`);
    }
  }

  let fixtureSummary: ImportJobSummary["fixtures"] = null;

  if (fixtureCandidates.length > 0 && !timedOut) {
    if (Date.now() >= deadline) {
      timedOut = true;
    } else {
      fixtureCandidates.sort(
        (a, b) => b.file.mtime.getTime() - a.file.mtime.getTime(),
      );
      const chosen = fixtureCandidates[0]!;
      for (const ignored of fixtureCandidates.slice(1)) {
        logger(
          `[fixtures] ignorado ${ignored.file.relative}: hay un lote más nuevo (${chosen.file.relative})`,
        );
      }

      try {
        const capturedAt = chosen.file.mtime;
        const stale = now.getTime() - capturedAt.getTime() > FIXTURE_MAX_AGE_MS;
        const unresolvedBefore = new Set(unresolved);
        const fixtureRows: {
          row: FixtureRow;
          homeTeamId: string | null;
          awayTeamId: string | null;
        }[] = [];

        for (const row of chosen.parsed.fixtures) {
          if (Date.now() >= deadline) {
            timedOut = true;
            break;
          }
          const homeTeamId = await teamIdFor(row.homeName);
          const awayTeamId = await teamIdFor(row.awayName);
          fixtureRows.push({ row, homeTeamId, awayTeamId });
        }

        if (!timedOut) {
          await prisma.$transaction(async (tx) => {
            await tx.upcomingFixture.deleteMany({
              where: { source: FIXTURE_SOURCE },
            });
            await tx.fixtureBatch.deleteMany({
              where: { source: FIXTURE_SOURCE },
            });
            const batch = await tx.fixtureBatch.create({
              data: {
                source: FIXTURE_SOURCE,
                sourceFile: chosen.file.relative,
                capturedAt,
                rowCount: fixtureRows.length,
                metadata: {
                  stale,
                  encoding: chosen.parsed.encoding,
                  delimiter: chosen.parsed.delimiter,
                },
              },
              select: { id: true },
            });
            const data: Prisma.UpcomingFixtureCreateManyInput[] =
              fixtureRows.map(({ row, homeTeamId, awayTeamId }) => ({
                batchId: batch.id,
                source: FIXTURE_SOURCE,
                sourceKey: row.sourceKey,
                competition: row.competition.competition,
                competitionCode: row.competition.code,
                kickoff: row.kickoff,
                homeTeamId,
                awayTeamId,
                homeName: row.homeName,
                awayName: row.awayName,
                odds: stale
                  ? undefined
                  : ((row.odds as Prisma.InputJsonValue | null) ?? undefined),
                oddsCapturedAt: stale ? null : capturedAt,
              }));
            if (data.length > 0) {
              await tx.upcomingFixture.createMany({
                data,
                skipDuplicates: true,
              });
            }
          });

          fixtureSummary = {
            file: chosen.file.relative,
            capturedAt: capturedAt.toISOString(),
            rows: fixtureRows.length,
            withOdds: stale
              ? 0
              : fixtureRows.filter((item) => item.row.odds !== null).length,
            stale,
            unresolved: [...unresolved].filter(
              (name) => !unresolvedBefore.has(name),
            ),
          };
          logger(
            `[fixtures] ${chosen.file.relative} | futuros ${fixtureRows.length} | con cuotas ${fixtureSummary.withOdds} | capturado ${capturedAt.toISOString()}${stale ? " | CUOTAS DESCARTADAS (>4 días)" : ""}`,
          );
        }

        for (const candidate of fixtureCandidates) {
          await prisma.analysisImportFile.upsert({
            where: { path: candidate.file.relative },
            create: {
              path: candidate.file.relative,
              kind: "fixtures",
              size: candidate.file.size,
              mtime: candidate.file.mtime,
              hash: candidate.file.hash,
              processedAt: now,
            },
            update: {
              kind: "fixtures",
              size: candidate.file.size,
              mtime: candidate.file.mtime,
              hash: candidate.file.hash,
              processedAt: now,
            },
          });
        }
      } catch (error) {
        errors.push(`fixtures: ${String(error)}`);
        logger(`[fixtures] falló (${String(error)})`);
      }
    }
  }

  const newUnresolved = [...unresolved];
  if (newUnresolved.length > 0) {
    logger(
      `[aliases] ${newUnresolved.length} equipo(s) sin alias resuelto. Ejecuta npm run analysis:aliases para ver sugerencias.`,
    );
    for (const name of newUnresolved.slice(0, 20)) {
      const suggestions = suggestTeamAliases(name, aliasKeys, 3);
      logger(
        `  - ${name}${suggestions.length ? ` → ${suggestions.join(", ")}` : ""}`,
      );
    }
  }

  const totalCreated = historicalStats.reduce(
    (sum, item) => sum + item.created,
    0,
  );
  const totalRows = historicalStats.reduce((sum, item) => sum + item.rows, 0);
  const totalOld = historicalStats.reduce((sum, item) => sum + item.old, 0);
  const totalInvalid = historicalStats.reduce(
    (sum, item) => sum + item.invalid,
    0,
  );
  const totalMissing = historicalStats.reduce(
    (sum, item) => sum + item.missingScore,
    0,
  );
  const totalDuplicates = historicalStats.reduce(
    (sum, item) => sum + item.duplicatesInFile,
    0,
  );

  logger(
    `[import] resumen: ${changed.length} archivos revisados, ${totalRows} filas válidas, ${totalCreated} nuevas, ${skippedFiles} sin cambios`,
  );

  return {
    ok: errors.length === 0 && !timedOut,
    timedOut,
    files: discovered.length,
    changedFiles: changed.length,
    skippedFiles,
    historical: {
      files: historicalStats.length,
      rows: totalRows,
      created: totalCreated,
      existing: historicalStats.reduce((sum, item) => sum + item.existing, 0),
      old: totalOld,
      invalid: totalInvalid,
      missingScore: totalMissing,
      duplicates: totalDuplicates,
    },
    fixtures: fixtureSummary,
    unresolved: newUnresolved,
    errors,
    durationMs: Date.now() - startedAt,
  };
}
