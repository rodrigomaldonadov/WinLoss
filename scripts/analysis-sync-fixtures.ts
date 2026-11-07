/**
 * Sincroniza próximos partidos desde TheSportsDB y football-data.org.
 *
 * No descarga cuotas: las cuotas de mercado solo entran por el CSV semanal de
 * fixtures. Reemplaza el lote anterior de cada proveedor para no acumular
 * partidos viejos. Uso manual:
 *
 *   npm run analysis:sync
 */

import { readFileSync } from "node:fs";

import { Prisma, PrismaClient } from "@prisma/client";

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

const SOURCE_PREFIX = "sports-api";

type ResolvedTeam = {
  teamId: string | null;
  canonicalName: string;
};

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
  const byNormalized = new Map(teams.map((team) => [team.normalizedName, team]));
  const byAlias = new Map<string, (typeof teams)[number]>();
  for (const team of teams) {
    for (const alias of team.aliases) byAlias.set(alias.normalized, team);
  }

  function resolveTeam(raw: string): ResolvedTeam {
    const key = normalizeTeamName(raw);
    const canonical =
      aliases.teams[key] ??
      byNormalized.get(key)?.canonicalName ??
      byAlias.get(key)?.canonicalName ??
      null;
    if (!canonical) return { teamId: null, canonicalName: raw };
    const team = byNormalized.get(normalizeTeamName(canonical));
    return { teamId: team?.id ?? null, canonicalName: canonical };
  }

  const now = new Date();
  const fetched: ApiFixture[] = [];
  const errors: string[] = [];
  const successfulProviders = new Set<ApiFixture["provider"]>();

  for (const target of TARGETS) {
    try {
      const events = await fetchTsdbFixtures(target.competition, now);
      fetched.push(...events);
      successfulProviders.add("thesportsdb");
      console.log(
        `[thesportsdb] ${target.competition}: ${events.length} próximos`,
      );
    } catch (error) {
      errors.push(`thesportsdb ${target.competition}: ${String(error)}`);
      console.warn(`[thesportsdb] ${target.competition}: ${String(error)}`);
    }
    await sleep(2_000);
  }

  for (const target of TARGETS) {
    if (!process.env.FOOTBALL_DATA_API_KEY) break;
    try {
      const events = await fetchFootballDataFixtures(target.competition, now);
      fetched.push(...events);
      successfulProviders.add("football-data");
      console.log(
        `[football-data] ${target.competition}: ${events.length} próximos`,
      );
    } catch (error) {
      errors.push(`football-data ${target.competition}: ${String(error)}`);
      console.warn(
        `[football-data] ${target.competition}: ${String(error)}`,
      );
    }
    await sleep(6_500);
  }

  if (fetched.length === 0) {
    throw new Error("Las APIs no devolvieron próximos partidos; no se tocó la base.");
  }

  // Deduplica entre proveedores: football-data tiene prioridad por ser el
  // proveedor principal del proyecto.
  const priority: Record<ApiFixture["provider"], number> = {
    "football-data": 0,
    thesportsdb: 1,
  };
  const byKey = new Map<string, ApiFixture>();
  for (const fixture of fetched.sort(
    (a, b) => priority[a.provider] - priority[b.provider],
  )) {
    const key = `${normalizeTeamName(fixture.home)}|${normalizeTeamName(fixture.away)}|${fixture.kickoff.slice(0, 10)}`;
    if (!byKey.has(key)) byKey.set(key, fixture);
  }
  const fixtures = [...byKey.values()];

  const byProvider = new Map<ApiFixture["provider"], ApiFixture[]>();
  for (const fixture of fixtures) {
    const list = byProvider.get(fixture.provider) ?? [];
    list.push(fixture);
    byProvider.set(fixture.provider, list);
  }

  const unresolved = new Map<string, number>();
  let resolved = 0;

  for (const provider of successfulProviders) {
    const providerFixtures = byProvider.get(provider) ?? [];
    const source = `${SOURCE_PREFIX}:${provider}`;
    const capturedAt = now;
    const records: Prisma.UpcomingFixtureCreateManyInput[] = [];

    for (const fixture of providerFixtures) {
      const home = resolveTeam(fixture.home);
      const away = resolveTeam(fixture.away);
      if (!home.teamId || !away.teamId) {
        for (const raw of [
          !home.teamId ? fixture.home : null,
          !away.teamId ? fixture.away : null,
        ]) {
          if (raw) unresolved.set(raw, (unresolved.get(raw) ?? 0) + 1);
        }
      }
      if (home.teamId && away.teamId) resolved += 1;

      records.push({
        batchId: "",
        source,
        sourceKey: `${source}|${fixture.externalId}`,
        competition: fixture.competition,
        competitionCode: fixture.competitionCode,
        kickoff: new Date(fixture.kickoff),
        homeTeamId: home.teamId,
        awayTeamId: away.teamId,
        homeName: fixture.home,
        awayName: fixture.away,
        odds: Prisma.JsonNull,
        oddsCapturedAt: null,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.upcomingFixture.deleteMany({ where: { source } });
      await tx.fixtureBatch.deleteMany({ where: { source } });
      const batch = await tx.fixtureBatch.create({
        data: {
          source,
          sourceFile: `${provider} API`,
          capturedAt,
          rowCount: records.length,
          metadata: {
            windowDays: 21,
            unresolved: [...unresolved.keys()],
          },
        },
        select: { id: true },
      });
      if (records.length > 0) {
        await tx.upcomingFixture.createMany({
          data: records.map((record) => ({
            ...record,
            batchId: batch.id,
          })),
          skipDuplicates: true,
        });
      }
    });

    console.log(
      `[sync] ${provider}: ${records.length} partidos guardados (${resolved} equipos resueltos hasta ahora)`,
    );
  }

  console.log("");
  console.log(`Partidos próximos: ${fixtures.length}`);
  console.log(`Con ambos equipos resueltos: ${resolved}`);
  console.log(`Nombres sin resolver: ${unresolved.size}`);
  if (errors.length > 0) {
    console.log(`Proveedores con error: ${errors.length}`);
  }
  if (unresolved.size > 0) {
    console.log("");
    console.log("Nombres sin resolver y sugerencias");
    for (const [name, count] of [...unresolved.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const suggestions = suggestTeamAliases(name, aliasKeys, 3);
      console.log(
        `- ${name} (${count})${suggestions.length ? ` → ${suggestions.join(", ")}` : ""}`,
      );
    }
    console.log(
      "Añade el alias explícito en team-aliases.json y vuelve a ejecutar analysis:sync.",
    );
  }
  console.log("");
  console.log(
    "Sin cuotas de mercado: las cuotas solo se importan desde data-football/fixtures/.",
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
