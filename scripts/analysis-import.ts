import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import { decodeCsvBuffer } from "../src/lib/analysis/csv";
import {
  FIXTURE_MAX_AGE_MS,
  FIXTURE_SOURCE,
  HISTORICAL_SOURCE,
  parseAnalysisFile,
  resolveTeamName,
  type FixtureRow,
} from "../src/lib/analysis/import";
import {
  isTeamAliasesFile,
  normalizeTeamName,
  suggestTeamAliases,
  type TeamAliasesFile,
} from "../src/lib/analysis/team-names";

function loadEnv() {
  if (!existsSync(".env")) return;
  const text = readFileSync(".env", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match?.[1]) continue;
    const value = (match[2] ?? "").replace(/^["']|["']$/g, "");
    process.env[match[1]] ??= value;
  }
}

type FileEntry = {
  full: string;
  relative: string;
  mtime: Date;
  size: number;
};

type HistoricalStats = {
  file: string;
  format: string;
  rows: number;
  created: number;
  existing: number;
  old: number;
  invalid: number;
  missingScore: number;
  duplicatesInFile: number;
  unresolved: string[];
};

function walk(dir: string): FileEntry[] {
  const entries: FileEntry[] = [];
  const visit = (current: string) => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      if (item.name.startsWith(".")) continue;
      const full = join(current, item.name);
      if (item.isDirectory()) {
        visit(full);
      } else if (item.isFile() && item.name.toLowerCase().endsWith(".csv")) {
        const stat = statSync(full);
        entries.push({
          full,
          relative: relative(process.cwd(), full).replace(/\\/g, "/"),
          mtime: stat.mtime,
          size: stat.size,
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

async function main() {
  loadEnv();
  const aliasPath = process.env.TEAM_ALIASES_FILE ?? "team-aliases.json";
  if (!existsSync(aliasPath)) {
    throw new Error(`No existe ${aliasPath}`);
  }
  const aliasJson = JSON.parse(readFileSync(aliasPath, "utf8"));
  if (!isTeamAliasesFile(aliasJson)) {
    throw new Error("team-aliases.json no tiene el formato esperado.");
  }
  const aliases: TeamAliasesFile = {
    version: aliasJson.version ?? 1,
    teams: aliasJson.teams,
  };
  const aliasKeys = Object.keys(aliases.teams);

  const requested =
    process.argv[2] ??
    process.env.ANALYSIS_DATA_DIR ??
    "data-football";
  const input = resolve(requested);
  if (!existsSync(input)) {
    throw new Error(`No existe la ruta ${input}`);
  }
  const inputStat = statSync(input);
  const files = inputStat.isDirectory()
    ? walk(input)
    : [
        {
          full: input,
          relative: relative(process.cwd(), input).replace(/\\/g, "/"),
          mtime: inputStat.mtime,
          size: inputStat.size,
        },
      ];

  if (files.length === 0) {
    throw new Error("No se encontraron archivos CSV.");
  }

  // Cada archivo es una temporada distinta: se importan todos. Los duplicados
  // reales de liga+temporada los evita la clave única de HistoricalMatch.
  const selected = [...files].sort((a, b) =>
    a.relative.localeCompare(b.relative),
  );

  const prisma = new PrismaClient();
  const teamCache = new Map<string, string>();
  const aliasDone = new Set<string>();
  const unresolved = new Set<string>();

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

  for (const entry of selected) {
    let text: string;
    let encoding: string;
    try {
      const decoded = decodeCsvBuffer(readFileSync(entry.full));
      text = decoded.text;
      encoding = decoded.encoding;
    } catch (error) {
      console.warn(`[skip] ${entry.relative}: no se pudo leer (${String(error)})`);
      continue;
    }

    const parsed = parseAnalysisFile(text, entry.relative, encoding);
    if (parsed.format === "unsupported") {
      console.warn(`[skip] ${entry.relative}: formato no reconocido`);
      continue;
    }
    if (parsed.format === "fixtures") {
      fixtureCandidates.push({ parsed, file: entry });
      continue;
    }

    const records: Prisma.HistoricalMatchCreateManyInput[] = [];
    const unresolvedBefore = new Set(unresolved);
    for (const row of parsed.rows) {
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

    const seasons = [...new Set(records.map((record) => record.season))];
    const existingKeys = new Set<string>();
    for (const season of seasons) {
      const existing = await prisma.historicalMatch.findMany({
        where: {
          competition: records[0]?.competition ?? "",
          season,
        },
        select: { playedAt: true, homeTeamId: true, awayTeamId: true },
      });
      for (const item of existing) {
        existingKeys.add(
          `${season}|${item.playedAt.toISOString()}|${item.homeTeamId}|${item.awayTeamId}`,
        );
      }
    }

    let existing = 0;
    for (const record of records) {
      const key = `${record.season}|${new Date(record.playedAt).toISOString()}|${record.homeTeamId}|${record.awayTeamId}`;
      if (existingKeys.has(key)) existing += 1;
    }

    let created = 0;
    for (const piece of chunk(records, 1000)) {
      const result = await prisma.historicalMatch.createMany({
        data: piece,
        skipDuplicates: true,
      });
      created += result.count;
    }

    historicalStats.push({
      file: entry.relative,
      format: parsed.format,
      rows: parsed.rows.length,
      created,
      existing,
      old: parsed.skippedOld,
      invalid: parsed.skippedInvalid,
      missingScore: parsed.skippedMissingScore,
      duplicatesInFile: parsed.duplicatesInFile,
      unresolved: [...unresolved].filter((name) => !unresolvedBefore.has(name)),
    });

    console.log(
      `[historical] ${entry.relative} | leídas ${parsed.rows.length} | nuevas ${created} | existentes ${existing} | antiguas ${parsed.skippedOld} | inválidas ${parsed.skippedInvalid} | sin marcador ${parsed.skippedMissingScore} | duplicadas ${parsed.duplicatesInFile}`,
    );
  }

  let fixtureSummary: {
    file: string | null;
    capturedAt: string | null;
    rows: number;
    withOdds: number;
    stale: boolean;
    unresolved: string[];
  } = {
    file: null,
    capturedAt: null,
    rows: 0,
    withOdds: 0,
    stale: false,
    unresolved: [],
  };

  fixtureCandidates.sort(
    (a, b) => b.file.mtime.getTime() - a.file.mtime.getTime(),
  );
  if (fixtureCandidates.length > 0) {
    const chosen = fixtureCandidates[0]!;
    for (const ignored of fixtureCandidates.slice(1)) {
      console.warn(
        `[fixtures] ignorado ${ignored.file.relative}: hay un lote más nuevo (${chosen.file.relative})`,
      );
    }

    const capturedAt = chosen.file.mtime;
    const stale =
      Date.now() - capturedAt.getTime() > FIXTURE_MAX_AGE_MS;
    const unresolvedBefore = new Set(unresolved);
    const fixtureRows: {
      row: FixtureRow;
      homeTeamId: string | null;
      awayTeamId: string | null;
    }[] = [];

    for (const row of chosen.parsed.fixtures) {
      const homeTeamId = await teamIdFor(row.homeName);
      const awayTeamId = await teamIdFor(row.awayName);
      fixtureRows.push({ row, homeTeamId, awayTeamId });
    }

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
      const data: Prisma.UpcomingFixtureCreateManyInput[] = fixtureRows.map(
        ({ row, homeTeamId, awayTeamId }) => ({
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
        }),
      );
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
      unresolved: [...unresolved].filter((name) => !unresolvedBefore.has(name)),
    };
    console.log(
      `[fixtures] ${chosen.file.relative} | futuros ${fixtureRows.length} | con cuotas ${fixtureSummary.withOdds} | capturado ${capturedAt.toISOString()}${stale ? " | CUOTAS DESCARTADAS (>4 días)" : ""}`,
    );
  } else {
    console.log(
      "[fixtures] No se encontró ningún lote en data-football/fixtures/. La fuente de mercado quedará vacía.",
    );
  }

  const newUnresolved = [...unresolved];
  if (newUnresolved.length > 0) {
    console.warn(
      `[aliases] ${newUnresolved.length} equipo(s) sin alias resuelto. Ejecuta npm run analysis:aliases para ver sugerencias.`,
    );
    for (const name of newUnresolved.slice(0, 20)) {
      const suggestions = suggestTeamAliases(name, aliasKeys, 3);
      console.warn(`  - ${name}${suggestions.length ? ` → ${suggestions.join(", ")}` : ""}`);
    }
  }

  const totalCreated = historicalStats.reduce((sum, item) => sum + item.created, 0);
  const totalRows = historicalStats.reduce((sum, item) => sum + item.rows, 0);
  const totalOld = historicalStats.reduce((sum, item) => sum + item.old, 0);
  const totalInvalid = historicalStats.reduce((sum, item) => sum + item.invalid, 0);
  const totalMissing = historicalStats.reduce((sum, item) => sum + item.missingScore, 0);
  const totalDuplicates = historicalStats.reduce(
    (sum, item) => sum + item.duplicatesInFile,
    0,
  );

  console.log("");
  console.log("Resumen de importación");
  console.log(`Archivos CSV: ${files.length}`);
  console.log(`Históricos: ${totalRows} válidos, ${totalCreated} nuevos, ${totalOld} antiguos descartados, ${totalInvalid} inválidos, ${totalMissing} sin marcador, ${totalDuplicates} duplicados en archivo`);
  console.log(`Equipos sin alias: ${newUnresolved.length}`);
  console.log(`Fixtures: ${fixtureSummary.file ?? "sin archivo"} (${fixtureSummary.rows} futuros)`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
