import { readFileSync } from "node:fs";

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  fetchFootballDataResults,
  fetchTsdbResults,
  sleep as defaultSleep,
  TARGETS,
  type ApiResult,
} from "@/lib/analysis/api";
import {
  isTeamAliasesFile,
  normalizeTeamName,
  suggestTeamAliases,
  type TeamAliasesFile,
} from "@/lib/analysis/team-names";

import { resultDedupeKey, seasonForResult } from "./result-dedupe";

const DAY_MS = 86_400_000;
export const API_RESULT_SOURCE = "api";

type Logger = (message: string) => void;

export type ResultsJobSummary = {
  ok: boolean;
  timedOut: boolean;
  fetched: number;
  created: number;
  updated: number;
  skippedOfficial: number;
  unresolved: string[];
  errors: string[];
  durationMs: number;
};

function resultLetter(homeGoals: number, awayGoals: number): string {
  if (homeGoals > awayGoals) return "H";
  if (homeGoals === awayGoals) return "D";
  return "A";
}

function isUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Trae resultados FINISHED de las APIs, los guarda como HistoricalMatch
 * provisionales y nunca pisa una fila oficial de CSV. Solo 90 minutos.
 */
export async function runResultsJob({
  prisma,
  aliasesPath = process.env.TEAM_ALIASES_FILE ?? "team-aliases.json",
  now = new Date(),
  deadline = Number.POSITIVE_INFINITY,
  minAgeMs = Number(process.env.ANALYSIS_RESULTS_MIN_AGE_MS ?? String(3 * 60 * 60 * 1000)),
  windowDays = 7,
  logger = () => {},
  fetchTsdb = fetchTsdbResults,
  fetchFootballData = fetchFootballDataResults,
  throttle = { tsdb: 2_000, footballData: 6_500 },
  sleep = defaultSleep,
}: {
  prisma: PrismaClient;
  aliasesPath?: string;
  now?: Date;
  deadline?: number;
  minAgeMs?: number;
  windowDays?: number;
  logger?: Logger;
  fetchTsdb?: typeof fetchTsdbResults;
  fetchFootballData?: typeof fetchFootballDataResults;
  throttle?: { tsdb: number; footballData: number };
  sleep?: (ms: number) => Promise<void>;
}): Promise<ResultsJobSummary> {
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

  function resolveTeamName(raw: string): string | null {
    const key = normalizeTeamName(raw);
    return (
      aliases.teams[key] ??
      byNormalized.get(key)?.canonicalName ??
      byAlias.get(key)?.canonicalName ??
      null
    );
  }

  async function resolveTeam(
    raw: string,
  ): Promise<{ teamId: string | null; name: string }> {
    const canonical = resolveTeamName(raw);
    if (!canonical) return { teamId: null, name: raw };
    const normalized = normalizeTeamName(canonical);
    let team = byNormalized.get(normalized);
    if (!team) {
      const created = await prisma.team.upsert({
        where: { normalizedName: normalized },
        create: { canonicalName: canonical, normalizedName: normalized },
        update: { canonicalName: canonical },
        select: { id: true, canonicalName: true, normalizedName: true },
      });
      team = { ...created, aliases: [] };
      byNormalized.set(normalized, team);
    }
    return { teamId: team.id, name: canonical };
  }

  const fetched: ApiResult[] = [];
  const errors: string[] = [];
  let timedOut = false;

  for (const target of TARGETS) {
    if (Date.now() >= deadline) {
      timedOut = true;
      errors.push("resultados: límite de tiempo alcanzado");
      break;
    }
    try {
      const results = await fetchTsdb(target.competition, now, windowDays);
      fetched.push(...results);
      logger(`[results/thesportsdb] ${target.competition}: ${results.length}`);
    } catch (error) {
      errors.push(`results thesportsdb ${target.competition}: ${String(error)}`);
    }
    if (throttle.tsdb > 0) await sleep(throttle.tsdb);
  }

  for (const target of TARGETS) {
    if (Date.now() >= deadline) {
      timedOut = true;
      errors.push("resultados: límite de tiempo alcanzado");
      break;
    }
    if (!process.env.FOOTBALL_DATA_API_KEY) break;
    try {
      const results = await fetchFootballData(target.competition, now, windowDays);
      fetched.push(...results);
      logger(`[results/football-data] ${target.competition}: ${results.length}`);
    } catch (error) {
      errors.push(
        `results football-data ${target.competition}: ${String(error)}`,
      );
    }
    if (throttle.footballData > 0) await sleep(throttle.footballData);
  }

  const priority: Record<ApiResult["provider"], number> = {
    "football-data": 0,
    thesportsdb: 1,
  };
  const byKey = new Map<string, ApiResult>();
  for (const result of fetched.sort(
    (a, b) => priority[a.provider] - priority[b.provider],
  )) {
    const key = [
      result.competition,
      normalizeTeamName(result.home),
      normalizeTeamName(result.away),
      result.kickoff.slice(0, 10),
    ].join("|");
    if (!byKey.has(key)) byKey.set(key, result);
  }

  const recent = [...byKey.values()].filter((result) => {
    const kickoff = Date.parse(result.kickoff);
    return (
      Number.isFinite(kickoff) &&
      kickoff <= now.getTime() - minAgeMs &&
      kickoff >= now.getTime() - windowDays * DAY_MS
    );
  });

  const unresolved = new Set<string>();
  let created = 0;
  let updated = 0;
  let skippedOfficial = 0;

  for (const result of recent) {
    if (Date.now() >= deadline) {
      timedOut = true;
      errors.push("resultados: límite de tiempo antes de guardar");
      break;
    }
    const home = await resolveTeam(result.home);
    const away = await resolveTeam(result.away);
    if (!home.teamId || !away.teamId) {
      if (!home.teamId) unresolved.add(result.home);
      if (!away.teamId) unresolved.add(result.away);
      continue;
    }

    const playedAt = new Date(result.kickoff);
    const { season, seasonStart } = seasonForResult(
      result.competitionCode,
      playedAt,
    );
    const dedupeKey = resultDedupeKey({
      competition: result.competition,
      competitionCode: result.competitionCode,
      playedAt,
      homeTeamId: home.teamId,
      awayTeamId: away.teamId,
    });
    const letter = resultLetter(result.homeGoals, result.awayGoals);

    try {
      const existing = await prisma.historicalMatch.findUnique({
        where: { dedupeKey },
        select: {
          id: true,
          provisional: true,
          homeGoals: true,
          awayGoals: true,
        },
      });

      if (existing) {
        if (!existing.provisional) {
          skippedOfficial += 1;
          continue;
        }
        if (
          existing.homeGoals !== result.homeGoals ||
          existing.awayGoals !== result.awayGoals
        ) {
          await prisma.historicalMatch.update({
            where: { id: existing.id },
            data: {
              source: API_RESULT_SOURCE,
              provisional: true,
              homeGoals: result.homeGoals,
              awayGoals: result.awayGoals,
              result: letter,
            },
          });
          updated += 1;
        }
        continue;
      }

      // Compatibilidad con filas creadas antes de existir dedupeKey.
      const fallback = await prisma.historicalMatch.findFirst({
        where: {
          competition: result.competition,
          homeTeamId: home.teamId,
          awayTeamId: away.teamId,
          playedAt: {
            gte: new Date(playedAt.getTime() - DAY_MS),
            lte: new Date(playedAt.getTime() + DAY_MS),
          },
        },
        select: { id: true, provisional: true, dedupeKey: true },
      });

      if (fallback) {
        if (!fallback.provisional) {
          if (!fallback.dedupeKey) {
            await prisma.historicalMatch.update({
              where: { id: fallback.id },
              data: { dedupeKey },
            });
          }
          skippedOfficial += 1;
          continue;
        }
        await prisma.historicalMatch.update({
          where: { id: fallback.id },
          data: {
            source: API_RESULT_SOURCE,
            provisional: true,
            dedupeKey,
            season,
            seasonStart,
            homeGoals: result.homeGoals,
            awayGoals: result.awayGoals,
            result: letter,
          },
        });
        updated += 1;
        continue;
      }

      await prisma.historicalMatch.create({
        data: {
          source: API_RESULT_SOURCE,
          provisional: true,
          dedupeKey,
          competition: result.competition,
          competitionCode: result.competitionCode,
          season,
          seasonStart,
          playedAt,
          homeTeamId: home.teamId,
          awayTeamId: away.teamId,
          homeGoals: result.homeGoals,
          awayGoals: result.awayGoals,
          result: letter,
          odds: Prisma.JsonNull,
          stats: Prisma.JsonNull,
        },
      });
      created += 1;
    } catch (error) {
      if (isUniqueError(error)) {
        skippedOfficial += 1;
        continue;
      }
      errors.push(
        `results ${result.competition} ${result.home}-${result.away}: ${String(error)}`,
      );
    }
  }

  const unresolvedList = [...unresolved];
  if (unresolvedList.length > 0) {
    logger(
      `[results] ${unresolvedList.length} equipo(s) sin alias: se omiten sus resultados.`,
    );
    for (const name of unresolvedList.slice(0, 20)) {
      const suggestions = suggestTeamAliases(name, aliasKeys, 3);
      logger(
        `  - ${name}${suggestions.length ? ` → ${suggestions.join(", ")}` : ""}`,
      );
    }
  }

  logger(
    `[results] ${recent.length} resultados recientes | ${created} nuevos | ${updated} actualizados | ${skippedOfficial} ya oficiales`,
  );

  return {
    ok: errors.length === 0 && !timedOut,
    timedOut,
    fetched: recent.length,
    created,
    updated,
    skippedOfficial,
    unresolved: unresolvedList,
    errors,
    durationMs: Date.now() - startedAt,
  };
}
