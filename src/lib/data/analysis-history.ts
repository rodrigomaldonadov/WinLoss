import "server-only";

import type {
  AnalysisConfidence,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import aliasesFile from "../../../team-aliases.json";

import {
  HISTORY_PAGE_SIZE,
  buildMineIndex,
  historyMatchKey,
  matchIsMine,
  type HistoryFilterState,
  type HistoryMode,
} from "@/lib/analysis/history";
import { actualOutcomeFromGoals } from "@/lib/analysis/review/build";
import { selectLatestSnapshot } from "@/lib/analysis/review/snapshot";
import {
  isTeamAliasesFile,
  normalizeTeamName,
  type TeamAliasesFile,
} from "@/lib/analysis/team-names";
import { zonedDateTimeToUtc } from "@/lib/date";
import { prisma } from "@/lib/prisma";

const aliases: TeamAliasesFile = isTeamAliasesFile(aliasesFile)
  ? aliasesFile
  : { version: 1, teams: {} };

const DAY_MS = 86_400_000;
const MATCH_TIME_TOLERANCE_MS = 2 * DAY_MS;

export type AnalysisHistoryItem = {
  id: string;
  competition: string;
  competitionCode: string | null;
  playedAt: Date;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  outcome: "HOME" | "DRAW" | "AWAY";
  provisional: boolean;
  mode: Exclude<HistoryMode, "all">;
  prediction: { home: number; draw: number; away: number } | null;
  confidence: AnalysisConfidence | null;
  hasBet: boolean;
};

export type AnalysisHistoryResult = {
  items: AnalysisHistoryItem[];
  total: number;
  page: number;
  totalPages: number;
  matchedTeams: { id: string; name: string }[];
  unknownTeam: boolean;
};

export type HistoryCompetitionOption = {
  name: string;
  count: number;
};

const ROW_SELECT = {
  id: true,
  competition: true,
  competitionCode: true,
  playedAt: true,
  homeGoals: true,
  awayGoals: true,
  provisional: true,
  source: true,
  homeTeamId: true,
  awayTeamId: true,
  homeTeam: { select: { canonicalName: true } },
  awayTeam: { select: { canonicalName: true } },
} satisfies Prisma.HistoricalMatchSelect;

type HistoryRow = Prisma.HistoricalMatchGetPayload<{ select: typeof ROW_SELECT }>;

const SNAPSHOT_SELECT = {
  matchKey: true,
  snapshotAt: true,
  kickoff: true,
  finalProbability: true,
  confidence: true,
} satisfies Prisma.AnalysisSnapshotSelect;

type SnapshotRow = Prisma.AnalysisSnapshotGetPayload<{
  select: typeof SNAPSHOT_SELECT;
}>;

type Triple = { home: number; draw: number; away: number };

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function parseTriple(value: Prisma.JsonValue | null): Triple | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.home !== "number" ||
    typeof record.draw !== "number" ||
    typeof record.away !== "number"
  ) {
    return null;
  }
  return { home: record.home, draw: record.draw, away: record.away };
}

/** Términos normalizados de la búsqueda, sin palabras de club ("FC", "CF"). */
function searchTerms(query: string): string[] {
  const normalized = normalizeTeamName(query);
  const terms = normalized.split(" ").filter(Boolean);
  return terms.length ? terms : [query.trim().toLowerCase()].filter(Boolean);
}

/**
 * Resuelve un nombre libre a equipos canónicos usando `normalizedName` y la
 * tabla de alias. "Man Utd" y "Manchester United" llegan al mismo equipo.
 */
async function resolveTeams(
  client: PrismaClient,
  query: string,
): Promise<{ id: string; name: string }[]> {
  const teams = await client.team.findMany({
    where: {
      AND: searchTerms(query).map((term) => ({
        OR: [
          { normalizedName: { contains: term } },
          { canonicalName: { contains: term, mode: "insensitive" } },
          { aliases: { some: { normalized: { contains: term } } } },
        ],
      })),
    },
    select: { id: true, canonicalName: true },
    orderBy: { canonicalName: "asc" },
    take: 25,
  });

  return teams.map((team) => ({ id: team.id, name: team.canonicalName }));
}

function buildWhere({
  filters,
  teamIds,
  from,
  to,
}: {
  filters: HistoryFilterState;
  teamIds: string[] | null;
  from: Date | null;
  to: Date | null;
}): Prisma.HistoricalMatchWhereInput {
  const and: Prisma.HistoricalMatchWhereInput[] = [];

  if (filters.competitions.length > 0) {
    and.push({ competition: { in: filters.competitions } });
  }
  if (from || to) {
    and.push({
      playedAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    });
  }
  if (teamIds !== null) {
    and.push({
      OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

type MineIndex = {
  fixtures: Map<string, number[]>;
  eventKeys: Set<string>;
};

async function loadExternalEventKeys(
  client: PrismaClient,
  externalIds: string[],
): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const group of chunk(externalIds, 400)) {
    const rows = await client.analysisSnapshot.findMany({
      where: { externalEventId: { in: group } },
      select: { matchKey: true },
      distinct: ["matchKey"],
    });
    for (const row of rows) keys.add(row.matchKey);
  }
  return keys;
}

async function loadMineIndex(
  client: PrismaClient,
  userId: string,
  from: Date | null,
  to: Date | null,
): Promise<MineIndex> {
  const legs = await client.betLeg.findMany({
    where: {
      bet: { userId },
      eventDate: {
        ...(from
          ? { gte: new Date(from.getTime() - MATCH_TIME_TOLERANCE_MS) }
          : {}),
        ...(to ? { lte: new Date(to.getTime() + MATCH_TIME_TOLERANCE_MS) } : {}),
      },
    },
    select: { eventName: true, eventDate: true, externalEventId: true },
  });

  const externalIds = [
    ...new Set(
      legs.flatMap((leg) => (leg.externalEventId ? [leg.externalEventId] : [])),
    ),
  ];

  const eventKeys =
    externalIds.length > 0
      ? await loadExternalEventKeys(client, externalIds)
      : new Set<string>();

  return { fixtures: buildMineIndex(legs, aliases), eventKeys };
}

function snapshotKey(row: HistoryRow): string {
  return historyMatchKey({
    homeName: row.homeTeam.canonicalName,
    awayName: row.awayTeam.canonicalName,
    playedAt: row.playedAt,
  });
}

async function latestSnapshotByKey(
  client: PrismaClient,
  rows: HistoryRow[],
): Promise<Map<string, SnapshotRow>> {
  const latest = new Map<string, SnapshotRow>();
  if (rows.length === 0) return latest;

  const keys = [...new Set(rows.map(snapshotKey))];

  const snapshots: SnapshotRow[] = [];
  for (const group of chunk(keys, 400)) {
    const found = await client.analysisSnapshot.findMany({
      where: { matchKey: { in: group } },
      select: SNAPSHOT_SELECT,
      orderBy: { snapshotAt: "desc" },
    });
    snapshots.push(...found);
  }

  const grouped = new Map<string, SnapshotRow[]>();
  for (const snapshot of snapshots) {
    const list = grouped.get(snapshot.matchKey) ?? [];
    list.push(snapshot);
    grouped.set(snapshot.matchKey, list);
  }

  for (const [key, list] of grouped) {
    const selected = selectLatestSnapshot(list);
    if (selected) latest.set(key, selected);
  }

  return latest;
}

function toHistoryItem({
  row,
  key,
  snapshot,
  mine,
}: {
  row: HistoryRow;
  key: string;
  snapshot: SnapshotRow | undefined;
  mine: MineIndex;
}): AnalysisHistoryItem {
  const homeName = row.homeTeam.canonicalName;
  const awayName = row.awayTeam.canonicalName;
  const prediction = snapshot ? parseTriple(snapshot.finalProbability) : null;
  const hasBet =
    mine.eventKeys.has(key) ||
    matchIsMine(
      mine.fixtures,
      { homeName, awayName, playedAt: row.playedAt },
      aliases,
    );

  return {
    id: row.id,
    competition: row.competition,
    competitionCode: row.competitionCode,
    playedAt: row.playedAt,
    homeName,
    awayName,
    homeGoals: row.homeGoals,
    awayGoals: row.awayGoals,
    outcome: actualOutcomeFromGoals(row.homeGoals, row.awayGoals),
    provisional: row.provisional || row.source === "api",
    mode: snapshot ? "saved" : "reconstructed",
    prediction,
    confidence: snapshot?.confidence ?? null,
    hasBet,
  };
}

function emptyResult(unknownTeam: boolean): AnalysisHistoryResult {
  return {
    items: [],
    total: 0,
    page: 1,
    totalPages: 1,
    matchedTeams: [],
    unknownTeam,
  };
}

export type GetAnalysisHistoryArgs = {
  userId: string;
  filters: HistoryFilterState;
  timeZone: string;
  client?: PrismaClient;
};

/**
 * Buscador de partidos jugados.
 *
 * Sin filtro de modo ni "mis partidos" pagina en la base de datos. Cuando hay
 * que distinguir guardada/reconstruida (o cruzar los picks del usuario) se
 * recorren las filas del rango y se resuelve en memoria: el histórico doméstico
 * son unos miles de partidos y el `matchKey` se calcula con los nombres.
 */
export async function getAnalysisHistory({
  userId,
  filters,
  timeZone,
  client = prisma,
}: GetAnalysisHistoryArgs): Promise<AnalysisHistoryResult> {
  const from = filters.from
    ? zonedDateTimeToUtc(`${filters.from}T00:00`, timeZone)
    : null;
  const to = filters.to
    ? zonedDateTimeToUtc(`${filters.to}T23:59`, timeZone)
    : null;

  const matchedTeams = filters.query
    ? await resolveTeams(client, filters.query)
    : [];

  if (filters.query && matchedTeams.length === 0) {
    return { ...emptyResult(true), matchedTeams: [] };
  }

  const where = buildWhere({
    filters,
    teamIds: filters.query ? matchedTeams.map((team) => team.id) : null,
    from,
    to,
  });

  const needsScan = filters.mode !== "all" || filters.mine;

  if (!needsScan) {
    const total = await client.historicalMatch.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
    const page = Math.min(Math.max(filters.page, 1), totalPages);
    const offset = (page - 1) * HISTORY_PAGE_SIZE;

    const [rows, mineIndex] = await Promise.all([
      client.historicalMatch.findMany({
        where,
        orderBy: [{ playedAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: HISTORY_PAGE_SIZE,
        select: ROW_SELECT,
      }),
      loadMineIndex(client, userId, from, to),
    ]);

    const snapshots = await latestSnapshotByKey(client, rows);

    return {
      items: rows.map((row) => {
        const key = snapshotKey(row);
        return toHistoryItem({
          row,
          key,
          snapshot: snapshots.get(key),
          mine: mineIndex,
        });
      }),
      total,
      page,
      totalPages,
      matchedTeams,
      unknownTeam: false,
    };
  }

  const [rows, mineIndex] = await Promise.all([
    client.historicalMatch.findMany({
      where,
      orderBy: [{ playedAt: "desc" }, { id: "desc" }],
      select: ROW_SELECT,
    }),
    loadMineIndex(client, userId, from, to),
  ]);

  if (
    filters.mine &&
    mineIndex.fixtures.size === 0 &&
    mineIndex.eventKeys.size === 0
  ) {
    return { ...emptyResult(false), matchedTeams };
  }

  const snapshots = await latestSnapshotByKey(client, rows);
  const items = rows
    .map((row) => {
      const key = snapshotKey(row);
      return toHistoryItem({
        row,
        key,
        snapshot: snapshots.get(key),
        mine: mineIndex,
      });
    })
    .filter((item) => filters.mode === "all" || item.mode === filters.mode)
    .filter((item) => !filters.mine || item.hasBet);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const page = Math.min(Math.max(filters.page, 1), totalPages);
  const offset = (page - 1) * HISTORY_PAGE_SIZE;

  return {
    items: items.slice(offset, offset + HISTORY_PAGE_SIZE),
    total,
    page,
    totalPages,
    matchedTeams,
    unknownTeam: false,
  };
}

/** Competiciones con resultados importados, de mayor a menor volumen. */
export async function getHistoryCompetitions(
  client: PrismaClient = prisma,
): Promise<HistoryCompetitionOption[]> {
  const groups = await client.historicalMatch.groupBy({
    by: ["competition"],
    _count: { _all: true },
  });

  return groups
    .map((group) => ({
      name: group.competition,
      count: group._count._all,
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.name.localeCompare(right.name, "es"),
    );
}

/** Sugerencias para el autocompletado de equipo (alias ya resueltos). */
export async function searchAnalysisTeams(
  query: string,
  {
    limit = 8,
    client = prisma,
  }: { limit?: number; client?: PrismaClient } = {},
): Promise<{ id: string; name: string }[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  return (await resolveTeams(client, trimmed)).slice(0, limit);
}

