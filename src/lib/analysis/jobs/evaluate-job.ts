import { Prisma, type PrismaClient } from "@prisma/client";

import { normalizeTeamName } from "@/lib/analysis/team-names";
import {
  brierScore,
  logLoss,
  outcomeIndex,
} from "@/lib/analysis/metrics";

type Logger = (message: string) => void;

export type EvaluationJobSummary = {
  ok: boolean;
  timedOut: boolean;
  evaluated: number;
  superseded: number;
  withoutResult: number;
  errors: string[];
  durationMs: number;
};

type Triple = [number, number, number];

function parseTriple(value: Prisma.JsonValue | null): Triple | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const home = record.home;
  const draw = record.draw;
  const away = record.away;
  if (
    typeof home !== "number" ||
    typeof draw !== "number" ||
    typeof away !== "number"
  ) {
    return null;
  }
  return [home, draw, away];
}

function resultLetter(homeGoals: number, awayGoals: number): string {
  if (homeGoals > awayGoals) return "H";
  if (homeGoals === awayGoals) return "D";
  return "A";
}

function normalizedIncludes(value: string | null, target: string): boolean {
  if (!value) return false;
  const left = normalizeTeamName(value);
  const right = normalizeTeamName(target);
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

/**
 * Evalúa el snapshot más reciente de cada partido cuando ya pasó el inicio.
 * Los snapshots antiguos del mismo partido se marcan como superseded, no se
 * borran: la captura original sigue siendo inmutable.
 */
export async function runEvaluationJob({
  prisma,
  now = new Date(),
  deadline = Number.POSITIVE_INFINITY,
  minAgeMs = Number(
    process.env.ANALYSIS_EVALUATION_DELAY_MS ?? String(3 * 60 * 60 * 1000),
  ),
  logger = () => {},
}: {
  prisma: PrismaClient;
  now?: Date;
  deadline?: number;
  minAgeMs?: number;
  logger?: Logger;
}): Promise<EvaluationJobSummary> {
  const startedAt = Date.now();
  const cutoff = new Date(now.getTime() - minAgeMs);
  let timedOut = false;
  const errors: string[] = [];

  const pending = await prisma.analysisSnapshot.findMany({
    where: {
      evaluatedAt: null,
      supersededAt: null,
      kickoff: { lt: cutoff },
    },
    orderBy: [{ matchKey: "asc" }, { snapshotAt: "desc" }],
  });

  const groups = new Map<string, typeof pending>();
  for (const snapshot of pending) {
    const list = groups.get(snapshot.matchKey) ?? [];
    list.push(snapshot);
    groups.set(snapshot.matchKey, list);
  }

  let evaluated = 0;
  let superseded = 0;
  let withoutResult = 0;

  for (const snapshots of groups.values()) {
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }
    const [snapshot, ...older] = snapshots;
    if (!snapshot) continue;

    if (older.length > 0) {
      await prisma.analysisSnapshot.updateMany({
        where: { id: { in: older.map((item) => item.id) } },
        data: { supersededAt: now },
      });
      superseded += older.length;
    }

    try {
      let homeGoals: number | null = null;
      let awayGoals: number | null = null;
      let resultSource: string | null = null;

      const historical = await prisma.historicalMatch.findFirst({
        where: {
          playedAt: {
            gte: new Date(snapshot.kickoff.getTime() - 2 * 86_400_000),
            lte: new Date(snapshot.kickoff.getTime() + 2 * 86_400_000),
          },
          OR: [
            ...(snapshot.homeTeamId && snapshot.awayTeamId
              ? [
                  {
                    homeTeamId: snapshot.homeTeamId,
                    awayTeamId: snapshot.awayTeamId,
                  },
                ]
              : []),
            {
              homeTeam: { canonicalName: snapshot.homeName },
              awayTeam: { canonicalName: snapshot.awayName },
            },
          ],
        },
        orderBy: { playedAt: "asc" },
        select: {
          homeGoals: true,
          awayGoals: true,
          source: true,
          provisional: true,
        },
      });

      if (historical) {
        homeGoals = historical.homeGoals;
        awayGoals = historical.awayGoals;
        resultSource = historical.provisional
          ? `${historical.source}:provisional`
          : historical.source;
      } else {
        const legs = await prisma.betLeg.findMany({
          where: {
            eventDate: {
              gte: new Date(snapshot.kickoff.getTime() - 2 * 86_400_000),
              lte: new Date(snapshot.kickoff.getTime() + 2 * 86_400_000),
            },
            scoreHome: { not: null },
            scoreAway: { not: null },
          },
          select: {
            homeTeam: true,
            awayTeam: true,
            eventName: true,
            scoreHome: true,
            scoreAway: true,
          },
          take: 100,
        });
        const leg = legs.find((item) => {
          const direct =
            normalizedIncludes(item.homeTeam, snapshot.homeName) &&
            normalizedIncludes(item.awayTeam, snapshot.awayName);
          const reverse =
            normalizedIncludes(item.homeTeam, snapshot.awayName) &&
            normalizedIncludes(item.awayTeam, snapshot.homeName);
          return direct || reverse;
        });
        if (leg && leg.scoreHome !== null && leg.scoreAway !== null) {
          const reverse =
            normalizedIncludes(leg.homeTeam, snapshot.awayName) &&
            !normalizedIncludes(leg.homeTeam, snapshot.homeName);
          homeGoals = reverse ? leg.scoreAway : leg.scoreHome;
          awayGoals = reverse ? leg.scoreHome : leg.scoreAway;
          resultSource = "betleg";
        }
      }

      if (homeGoals === null || awayGoals === null) {
        withoutResult += 1;
        continue;
      }

      const outcome = outcomeIndex(homeGoals, awayGoals);
      const market = parseTriple(snapshot.marketProbability);
      const model = parseTriple(snapshot.modelProbability);
      const challenger = parseTriple(snapshot.challengerProbability);

      await prisma.analysisSnapshot.update({
        where: { id: snapshot.id },
        data: {
          evaluatedAt: now,
          result: resultLetter(homeGoals, awayGoals),
          outcome,
          homeGoals,
          awayGoals,
          resultSource,
          marketBrier: market ? brierScore(market, outcome) : null,
          marketLogLoss: market ? logLoss(market, outcome) : null,
          modelBrier: model ? brierScore(model, outcome) : null,
          modelLogLoss: model ? logLoss(model, outcome) : null,
          challengerBrier: challenger
            ? brierScore(challenger, outcome)
            : null,
          challengerLogLoss: challenger
            ? logLoss(challenger, outcome)
            : null,
        },
      });
      evaluated += 1;
    } catch (error) {
      errors.push(
        `${snapshot.competition} ${snapshot.homeName}-${snapshot.awayName}: ${String(error)}`,
      );
      logger(`[evaluate] ${snapshot.matchKey}: ${String(error)}`);
    }
  }

  logger(
    `[evaluate] ${evaluated} evaluados | ${superseded} superseded | ${withoutResult} sin resultado`,
  );

  return {
    ok: errors.length === 0 && !timedOut,
    timedOut,
    evaluated,
    superseded,
    withoutResult,
    errors,
    durationMs: Date.now() - startedAt,
  };
}
