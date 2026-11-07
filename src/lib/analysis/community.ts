import { normalizeTeamName, type TeamAliasesFile } from "./team-names";
import type { Totals, Triple } from "./engine";

export type CommunitySelection = {
  marketKey: string;
  pick: string | null;
  line: number | null;
};

export type CommunityLeg = {
  userId: string;
  eventName: string;
  eventDate: Date | null;
  odds: number;
  isBuilder: boolean;
  shareAnonymousStats: boolean;
  selections: CommunitySelection[];
};

export type CommunityFixture = {
  homeName: string;
  awayName: string;
  kickoff: Date;
};

export type CommunityAggregate = {
  users: number;
  picks: number;
  probabilities: Triple | null;
  totals: Totals | null;
  anonymousOptIn: boolean;
  excludedUsers: number;
};

const TIME_TOLERANCE_MS = 36 * 60 * 60 * 1000;

function canonicalKey(raw: string, aliases: TeamAliasesFile): string {
  const key = normalizeTeamName(raw);
  if (!key) return "";
  const canonical = aliases.teams[key];
  return normalizeTeamName(canonical ?? raw);
}

function splitEventName(name: string): [string, string] | null {
  const match = /^(.+?)\s+(?:vs\.?|v\.?|@|-)\s+(.+)$/i.exec(name.trim());
  if (!match?.[1] || !match[2]) return null;
  return [match[1], match[2]];
}

export function legMatchesFixture(
  leg: CommunityLeg,
  fixture: CommunityFixture,
  aliases: TeamAliasesFile,
): boolean {
  if (
    leg.eventDate &&
    Math.abs(leg.eventDate.getTime() - fixture.kickoff.getTime()) >
      TIME_TOLERANCE_MS
  ) {
    return false;
  }

  const homeKey = canonicalKey(fixture.homeName, aliases);
  const awayKey = canonicalKey(fixture.awayName, aliases);
  if (!homeKey || !awayKey) return false;

  const parts = splitEventName(leg.eventName);
  if (parts) {
    const first = canonicalKey(parts[0], aliases);
    const second = canonicalKey(parts[1], aliases);
    if (
      (first === homeKey && second === awayKey) ||
      (first === awayKey && second === homeKey)
    ) {
      return true;
    }
  }

  const normalizedEvent = normalizeTeamName(leg.eventName);
  return (
    normalizedEvent.includes(homeKey) && normalizedEvent.includes(awayKey)
  );
}

function countsForLegs(
  legs: readonly CommunityLeg[],
  { requireOptIn }: { requireOptIn: boolean },
): CommunityAggregate {
  const included = legs.filter(
    (leg) => !requireOptIn || leg.shareAnonymousStats,
  );
  const excluded = new Set(
    legs
      .filter((leg) => !included.includes(leg))
      .map((leg) => leg.userId),
  );
  const users = new Set(included.map((leg) => leg.userId));

  const resultCounts = { HOME: 0, DRAW: 0, AWAY: 0 };
  const totalCounts = { OVER: 0, UNDER: 0 };
  let picks = 0;

  for (const leg of included) {
    for (const selection of leg.selections) {
      if (selection.marketKey === "MATCH_RESULT") {
        const pick = selection.pick?.toUpperCase();
        if (pick === "HOME" || pick === "DRAW" || pick === "AWAY") {
          resultCounts[pick] += 1;
          picks += 1;
        }
      }
      if (
        selection.marketKey === "TOTAL_GOALS" &&
        selection.line === 2.5
      ) {
        const pick = selection.pick?.toUpperCase();
        if (pick === "OVER" || pick === "UNDER") {
          totalCounts[pick] += 1;
          picks += 1;
        }
      }
    }
  }

  const resultTotal =
    resultCounts.HOME + resultCounts.DRAW + resultCounts.AWAY;
  const totalGoals = totalCounts.OVER + totalCounts.UNDER;

  return {
    users: users.size,
    picks,
    probabilities:
      resultTotal > 0
        ? {
            home: resultCounts.HOME / resultTotal,
            draw: resultCounts.DRAW / resultTotal,
            away: resultCounts.AWAY / resultTotal,
          }
        : null,
    totals:
      totalGoals > 0
        ? {
            over25: totalCounts.OVER / totalGoals,
            under25: totalCounts.UNDER / totalGoals,
          }
        : null,
    anonymousOptIn: included.some((leg) => leg.shareAnonymousStats),
    excludedUsers: excluded.size,
  };
}

/** Agregado anónimo: excluye a quien desactivó shareAnonymousStats. */
export function aggregateCommunityForFixture(
  legs: readonly CommunityLeg[],
  fixture: CommunityFixture,
  aliases: TeamAliasesFile,
): CommunityAggregate {
  const matching = legs.filter((leg) =>
    legMatchesFixture(leg, fixture, aliases),
  );
  return countsForLegs(matching, { requireOptIn: true });
}

/** Historial propio: no aplica el filtro de privacidad de la comunidad. */
export function aggregatePrivateForFixture(
  legs: readonly CommunityLeg[],
  fixture: CommunityFixture,
  aliases: TeamAliasesFile,
  userId: string,
): CommunityAggregate {
  const matching = legs.filter(
    (leg) =>
      leg.userId === userId && legMatchesFixture(leg, fixture, aliases),
  );
  return countsForLegs(matching, { requireOptIn: false });
}
