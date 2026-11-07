import "server-only";

import type { PrismaClient } from "@prisma/client";
import aliasesFile from "../../../team-aliases.json";

import {
  canonicalTeamKey,
  splitEventName,
} from "@/lib/analysis/community";
import {
  isTeamAliasesFile,
  type TeamAliasesFile,
} from "@/lib/analysis/team-names";
import { prisma } from "@/lib/prisma";

const aliases: TeamAliasesFile = isTeamAliasesFile(aliasesFile)
  ? aliasesFile
  : { version: 1, teams: {} };

const DAY_MS = 86_400_000;
const TIME_TOLERANCE_MS = 2 * DAY_MS;
const OR_CHUNK = 60;

export type AnalysisLinkLeg = {
  id: string;
  eventName: string;
  eventDate: Date | null;
  externalEventId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
};

type SnapshotLink = {
  externalEventId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeName: string;
  awayName: string;
  kickoff: Date;
  snapshotAt: Date;
};

type Candidate = {
  legId: string;
  homeTeamId: string;
  awayTeamId: string;
  date: Date;
  allowReverse: boolean;
};

type MatchRow = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  playedAt: Date;
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function namesForLeg(
  leg: AnalysisLinkLeg,
  snapshot: SnapshotLink | undefined,
): { home: string; away: string } | null {
  if (leg.homeTeam && leg.awayTeam) {
    return { home: leg.homeTeam, away: leg.awayTeam };
  }
  const parts = splitEventName(leg.eventName);
  if (parts) return { home: parts[0], away: parts[1] };
  if (snapshot?.homeName && snapshot.awayName) {
    return { home: snapshot.homeName, away: snapshot.awayName };
  }
  return null;
}

/**
 * Resuelve, en lote, el `HistoricalMatch` de cada leg.
 *
 * Prioriza `BetLeg.externalEventId` → `AnalysisSnapshot` (equipos y hora
 * exactos). Si no hay snapshot, cae a los nombres del leg (con alias) y una
 * tolerancia de ±2 días. Sin evento identificable devuelve el mapa sin esa leg.
 */
export async function resolveHistoryMatchIds(
  legs: readonly AnalysisLinkLeg[],
  client: PrismaClient = prisma,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (legs.length === 0) return result;

  const externalIds = [
    ...new Set(
      legs.flatMap((leg) =>
        leg.externalEventId ? [leg.externalEventId] : [],
      ),
    ),
  ];

  const snapshots =
    externalIds.length > 0
      ? await client.analysisSnapshot.findMany({
          where: { externalEventId: { in: externalIds } },
          select: {
            externalEventId: true,
            homeTeamId: true,
            awayTeamId: true,
            homeName: true,
            awayName: true,
            kickoff: true,
            snapshotAt: true,
          },
          orderBy: { snapshotAt: "desc" },
        })
      : [];

  const latestByEvent = new Map<string, SnapshotLink>();
  for (const snapshot of snapshots) {
    if (!snapshot.externalEventId) continue;
    if (!latestByEvent.has(snapshot.externalEventId)) {
      latestByEvent.set(snapshot.externalEventId, snapshot);
    }
  }

  const pending: {
    leg: AnalysisLinkLeg;
    snapshot: SnapshotLink | undefined;
    names: { home: string; away: string } | null;
    date: Date | null;
  }[] = [];
  const nameKeys = new Set<string>();

  for (const leg of legs) {
    const snapshot = leg.externalEventId
      ? latestByEvent.get(leg.externalEventId)
      : undefined;
    const names = namesForLeg(leg, snapshot);
    const date = leg.eventDate ?? snapshot?.kickoff ?? null;
    pending.push({ leg, snapshot, names, date });

    if (names) {
      const home = canonicalTeamKey(names.home, aliases);
      const away = canonicalTeamKey(names.away, aliases);
      if (home) nameKeys.add(home);
      if (away) nameKeys.add(away);
    }
  }

  const teams =
    nameKeys.size > 0
      ? await client.team.findMany({
          where: { normalizedName: { in: [...nameKeys] } },
          select: { id: true, normalizedName: true },
        })
      : [];
  const teamIdByKey = new Map(
    teams.map((team) => [team.normalizedName, team.id]),
  );

  const candidates: Candidate[] = [];

  for (const { leg, snapshot, names, date } of pending) {
    if (!date) continue;

    if (snapshot?.homeTeamId && snapshot.awayTeamId) {
      candidates.push({
        legId: leg.id,
        homeTeamId: snapshot.homeTeamId,
        awayTeamId: snapshot.awayTeamId,
        date,
        allowReverse: false,
      });
      continue;
    }

    if (!names) continue;
    const homeTeamId = teamIdByKey.get(canonicalTeamKey(names.home, aliases));
    const awayTeamId = teamIdByKey.get(canonicalTeamKey(names.away, aliases));
    if (!homeTeamId || !awayTeamId) continue;

    candidates.push({
      legId: leg.id,
      homeTeamId,
      awayTeamId,
      date,
      allowReverse: true,
    });
  }

  if (candidates.length === 0) return result;

  const times = candidates.map((candidate) => candidate.date.getTime());
  const from = new Date(Math.min(...times) - TIME_TOLERANCE_MS);
  const to = new Date(Math.max(...times) + TIME_TOLERANCE_MS);

  const pairs = candidates.flatMap((candidate) =>
    candidate.allowReverse
      ? [
          {
            homeTeamId: candidate.homeTeamId,
            awayTeamId: candidate.awayTeamId,
          },
          {
            homeTeamId: candidate.awayTeamId,
            awayTeamId: candidate.homeTeamId,
          },
        ]
      : [
          {
            homeTeamId: candidate.homeTeamId,
            awayTeamId: candidate.awayTeamId,
          },
        ],
  );

  const matches: MatchRow[] = [];
  for (const group of chunk(pairs, OR_CHUNK)) {
    const found = await client.historicalMatch.findMany({
      where: {
        playedAt: { gte: from, lte: to },
        OR: group,
      },
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
        playedAt: true,
      },
    });
    matches.push(...found);
  }

  for (const candidate of candidates) {
    const best = matches
      .filter((match) => {
        const exact =
          match.homeTeamId === candidate.homeTeamId &&
          match.awayTeamId === candidate.awayTeamId;
        const reversed =
          candidate.allowReverse &&
          match.homeTeamId === candidate.awayTeamId &&
          match.awayTeamId === candidate.homeTeamId;
        return exact || reversed;
      })
      .map((match) => ({
        id: match.id,
        delta: Math.abs(match.playedAt.getTime() - candidate.date.getTime()),
      }))
      .filter((match) => match.delta <= TIME_TOLERANCE_MS)
      .sort((left, right) => left.delta - right.delta)[0];

    if (best) result.set(candidate.legId, best.id);
  }

  return result;
}
