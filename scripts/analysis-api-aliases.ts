/**
 * Cruce de nombres de equipos entre HistoricalMatch y los próximos partidos de
 * TheSportsDB / football-data.org.
 *
 * No escribe en la base ni crea alias: solo reporta nombres sin resolver y
 * sugerencias. La resolución real sigue siendo team-aliases.json.
 */

import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import {
  fetchFootballDataFixtures,
  fetchTsdbFixtures,
  loadEnv,
  sleep,
  TARGETS,
  type ApiFixture,
} from "./lib/analysis-api";
import {
  isTeamAliasesFile,
  normalizeTeamName,
  suggestTeamAliases,
  type TeamAliasesFile,
} from "../src/lib/analysis/team-names";

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  const aliasJson = JSON.parse(readFileSync("team-aliases.json", "utf8"));
  if (!isTeamAliasesFile(aliasJson)) {
    throw new Error("team-aliases.json no tiene el formato esperado.");
  }
  const aliases: TeamAliasesFile = aliasJson;
  const aliasKeys = Object.keys(aliases.teams);

  const teams = await prisma.team.findMany({
    select: {
      id: true,
      canonicalName: true,
      normalizedName: true,
      aliases: { select: { normalized: true } },
    },
  });
  const byNormalized = new Map(
    teams.map((team) => [team.normalizedName, team]),
  );
  const byAlias = new Map<string, (typeof teams)[number]>();
  for (const team of teams) {
    for (const alias of team.aliases) {
      byAlias.set(alias.normalized, team);
    }
  }

  const history = await prisma.historicalMatch.findMany({
    where: {
      competitionCode: {
        in: TARGETS.map((target) => target.code).filter(
          (code) => code !== "PER1",
        ),
      },
    },
    select: {
      competitionCode: true,
      homeTeamId: true,
      awayTeamId: true,
    },
  });
  const competitionTeams = new Map<string, Set<string>>();
  for (const match of history) {
    if (!match.competitionCode) continue;
    const set = competitionTeams.get(match.competitionCode) ?? new Set();
    set.add(match.homeTeamId);
    set.add(match.awayTeamId);
    competitionTeams.set(match.competitionCode, set);
  }

  await prisma.$disconnect();

  const now = new Date();
  const fixtures: ApiFixture[] = [];
  for (const target of TARGETS) {
    try {
      const events = await fetchTsdbFixtures(target.competition, now);
      fixtures.push(...events);
      console.log(
        `[thesportsdb] ${target.competition}: ${events.length} próximos`,
      );
    } catch (error) {
      console.warn(
        `[thesportsdb] ${target.competition}: ${String(error)}`,
      );
    }
    await sleep(2_000);
  }

  for (const target of TARGETS) {
    if (!process.env.FOOTBALL_DATA_API_KEY) break;
    try {
      const events = await fetchFootballDataFixtures(
        target.competition,
        now,
      );
      fixtures.push(...events);
      console.log(
        `[football-data] ${target.competition}: ${events.length} próximos`,
      );
    } catch (error) {
      console.warn(
        `[football-data] ${target.competition}: ${String(error)}`,
      );
    }
    await sleep(6_500);
  }

  if (fixtures.length === 0) {
    console.log("No se obtuvieron próximos partidos de las APIs.");
    return;
  }

  const rawNames = new Map<
    string,
    { providers: Set<string>; competitions: Set<string> }
  >();
  const byProvider = new Map<
    string,
    { events: number; resolved: number; unresolved: number; outside: number }
  >();
  const unresolved = new Map<
    string,
    { providers: Set<string>; competitions: Set<string> }
  >();
  const resolvedOutside = new Set<string>();

  for (const fixture of fixtures) {
    const stats = byProvider.get(fixture.provider) ?? {
      events: 0,
      resolved: 0,
      unresolved: 0,
      outside: 0,
    };
    stats.events += 1;

    for (const raw of [fixture.home, fixture.away]) {
      const key = normalizeTeamName(raw);
      if (!key) continue;
      const entry = rawNames.get(raw) ?? {
        providers: new Set<string>(),
        competitions: new Set<string>(),
      };
      entry.providers.add(fixture.provider);
      entry.competitions.add(fixture.competition);
      rawNames.set(raw, entry);

      const canonical =
        aliases.teams[key] ??
        byNormalized.get(key)?.canonicalName ??
        byAlias.get(key)?.canonicalName ??
        null;
      if (!canonical) {
        stats.unresolved += 1;
        const missing = unresolved.get(raw) ?? {
          providers: new Set<string>(),
          competitions: new Set<string>(),
        };
        missing.providers.add(fixture.provider);
        missing.competitions.add(fixture.competition);
        unresolved.set(raw, missing);
        continue;
      }

      stats.resolved += 1;
      const normalizedCanonical = normalizeTeamName(canonical);
      const team = byNormalized.get(normalizedCanonical);
      const historical = new Set(
        competitionTeams.get(fixture.competitionCode ?? "") ?? [],
      );
      if (team && historical.size > 0 && !historical.has(team.id)) {
        stats.outside += 1;
        resolvedOutside.add(`${canonical} (${fixture.competition})`);
      }
    }
    byProvider.set(fixture.provider, stats);
  }

  console.log("");
  console.log("Resumen por proveedor");
  for (const [provider, stats] of byProvider) {
    console.log(
      `${provider}: ${stats.events} eventos · menciones resueltas ${stats.resolved} · menciones sin alias ${stats.unresolved} · menciones resueltas sin historial en la liga ${stats.outside}`,
    );
  }
  console.log(
    `Equipos únicos vistos: ${rawNames.size} · nombres sin resolver: ${unresolved.size}`,
  );

  if (unresolved.size > 0) {
    console.log("");
    console.log("Nombres sin resolver y sugerencias");
    for (const [name, entry] of [...unresolved.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const suggestions = suggestTeamAliases(name, aliasKeys, 3);
      console.log(
        `- ${name}  [${[...entry.providers].join(", ")} · ${[...entry.competitions].join(", ")}]${
          suggestions.length > 0
            ? `  sugerencias: ${suggestions.join(", ")}`
            : "  sin sugerencias"
        }`,
      );
    }
    console.log(
      "Edita team-aliases.json o vuelve a ejecutar npm run analysis:aliases tras importar nuevos históricos.",
    );
  }

  if (resolvedOutside.size > 0) {
    console.log("");
    console.log(
      "Nombres resueltos que no aparecen en el histórico de esa liga (posibles ascensos o alias cruzado):",
    );
    for (const item of [...resolvedOutside].sort()) {
      console.log(`- ${item}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
