import { readFileSync } from "node:fs";

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  fetchFootballDataFixtures,
  fetchTsdbFixtures,
  sleep as defaultSleep,
  TARGETS,
  type ApiFixture,
} from "@/lib/analysis/api";
import {
  isTeamAliasesFile,
  normalizeTeamName,
  suggestTeamAliases,
  type TeamAliasesFile,
} from "@/lib/analysis/team-names";

const SOURCE_PREFIX = "sports-api";

type Logger = (message: string) => void;

type ResolvedTeam = {
  teamId: string | null;
  canonicalName: string;
};

export type SyncProviderSummary = {
  provider: ApiFixture["provider"];
  competitions: number;
  fixtures: number;
  error?: string;
};

export type SyncJobSummary = {
  ok: boolean;
  timedOut: boolean;
  providers: SyncProviderSummary[];
  fixtures: number;
  resolved: number;
  unresolved: string[];
  errors: string[];
  skipped: boolean;
  durationMs: number;
};

/**
 * Sincroniza próximos partidos. Cada proveedor se aísla: si uno falla, el otro
 * sigue y conserva su lote anterior. Solo reemplaza lotes de proveedores que
 * respondieron correctamente en esta corrida.
 */
export async function runSyncJob({
  prisma,
  aliasesPath = process.env.TEAM_ALIASES_FILE ?? "team-aliases.json",
  now = new Date(),
  deadline = Number.POSITIVE_INFINITY,
  logger = () => {},
  fetchTsdb = fetchTsdbFixtures,
  fetchFootballData = fetchFootballDataFixtures,
  throttle = { tsdb: 2_000, footballData: 6_500 },
  sleep = defaultSleep,
}: {
  prisma: PrismaClient;
  aliasesPath?: string;
  now?: Date;
  deadline?: number;
  logger?: Logger;
  fetchTsdb?: typeof fetchTsdbFixtures;
  fetchFootballData?: typeof fetchFootballDataFixtures;
  throttle?: { tsdb: number; footballData: number };
  sleep?: (ms: number) => Promise<void>;
}): Promise<SyncJobSummary> {
  const startedAt = Date.now();
  const aliasJson = JSON.parse(
    readFileSync(/* turbopackIgnore: true */ aliasesPath, "utf8"),
  );
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

  const fetched: ApiFixture[] = [];
  const errors: string[] = [];
  const successfulProviders = new Set<ApiFixture["provider"]>();
  const providerCompetitions = new Map<ApiFixture["provider"], number>();
  let timedOut = false;

  const tsdbTargets = TARGETS;
  for (const target of tsdbTargets) {
    if (Date.now() >= deadline) {
      timedOut = true;
      errors.push("thesportsdb: límite de tiempo alcanzado");
      break;
    }
    try {
      const events = await fetchTsdb(target.competition, now);
      fetched.push(...events);
      successfulProviders.add("thesportsdb");
      providerCompetitions.set(
        "thesportsdb",
        (providerCompetitions.get("thesportsdb") ?? 0) + 1,
      );
      logger(`[thesportsdb] ${target.competition}: ${events.length} próximos`);
    } catch (error) {
      errors.push(`thesportsdb ${target.competition}: ${String(error)}`);
      logger(`[thesportsdb] ${target.competition}: ${String(error)}`);
    }
    if (throttle.tsdb > 0) await sleep(throttle.tsdb);
  }

  for (const target of TARGETS) {
    if (Date.now() >= deadline) {
      timedOut = true;
      errors.push("football-data: límite de tiempo alcanzado");
      break;
    }
    if (!process.env.FOOTBALL_DATA_API_KEY) break;
    try {
      const events = await fetchFootballData(target.competition, now);
      fetched.push(...events);
      successfulProviders.add("football-data");
      providerCompetitions.set(
        "football-data",
        (providerCompetitions.get("football-data") ?? 0) + 1,
      );
      logger(`[football-data] ${target.competition}: ${events.length} próximos`);
    } catch (error) {
      errors.push(`football-data ${target.competition}: ${String(error)}`);
      logger(`[football-data] ${target.competition}: ${String(error)}`);
    }
    if (throttle.footballData > 0) await sleep(throttle.footballData);
  }

  if (fetched.length === 0) {
    return {
      ok: false,
      timedOut,
      providers: [],
      fixtures: 0,
      resolved: 0,
      unresolved: [],
      errors: errors.length
        ? errors
        : ["Las APIs no devolvieron próximos partidos; no se tocó la base."],
      skipped: true,
      durationMs: Date.now() - startedAt,
    };
  }

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
  const providers: SyncProviderSummary[] = [];

  for (const provider of successfulProviders) {
    if (Date.now() >= deadline) {
      timedOut = true;
      errors.push(`${provider}: límite de tiempo antes de guardar`);
      break;
    }

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

    try {
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

      providers.push({
        provider,
        competitions: providerCompetitions.get(provider) ?? 0,
        fixtures: records.length,
      });
      logger(
        `[sync] ${provider}: ${records.length} partidos guardados (${resolved} equipos resueltos hasta ahora)`,
      );
    } catch (error) {
      const message = `${provider}: ${String(error)}`;
      errors.push(message);
      providers.push({
        provider,
        competitions: providerCompetitions.get(provider) ?? 0,
        fixtures: 0,
        error: String(error),
      });
      logger(`[sync] ${message}`);
    }
  }

  const unresolvedList = [...unresolved.keys()];
  if (unresolvedList.length > 0) {
    logger(
      `${unresolvedList.length} nombre(s) sin resolver. Añade el alias explícito en team-aliases.json y vuelve a ejecutar.`,
    );
    for (const name of unresolvedList.slice(0, 20)) {
      const suggestions = suggestTeamAliases(name, aliasKeys, 3);
      logger(
        `- ${name}${suggestions.length ? ` → ${suggestions.join(", ")}` : ""}`,
      );
    }
  }

  return {
    ok: errors.length === 0 && !timedOut,
    timedOut,
    providers,
    fixtures: fixtures.length,
    resolved,
    unresolved: unresolvedList,
    errors,
    skipped: false,
    durationMs: Date.now() - startedAt,
  };
}
