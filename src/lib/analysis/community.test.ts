import { describe, expect, it } from "vitest";

import {
  aggregateCommunityForFixture,
  aggregatePrivateForFixture,
  legMatchesFixture,
  type CommunityLeg,
} from "./community";
import type { TeamAliasesFile } from "./team-names";

const aliases: TeamAliasesFile = {
  version: 1,
  teams: {
    arsenal: "Arsenal",
    chelsea: "Chelsea",
    "newcastle united": "Newcastle",
    newcastle: "Newcastle",
    "man united": "Man United",
    "manchester united": "Man United",
  },
};

const fixture = {
  homeName: "Arsenal",
  awayName: "Chelsea",
  kickoff: new Date("2026-11-10T20:00:00.000Z"),
};

function leg(overrides: Partial<CommunityLeg> = {}): CommunityLeg {
  return {
    userId: "u1",
    eventName: "Arsenal vs Chelsea",
    eventDate: new Date("2026-11-10T20:00:00.000Z"),
    odds: 1.8,
    isBuilder: false,
    shareAnonymousStats: true,
    selections: [{ marketKey: "MATCH_RESULT", pick: "HOME", line: null }],
    ...overrides,
  };
}

describe("cruce de picks con próximos partidos", () => {
  it("acepta el orden local/visitante y los alias", () => {
    expect(legMatchesFixture(leg(), fixture, aliases)).toBe(true);
    expect(
      legMatchesFixture(
        leg({ eventName: "Chelsea vs Arsenal" }),
        fixture,
        aliases,
      ),
    ).toBe(true);
    expect(
      legMatchesFixture(
        leg({ eventName: "Newcastle United vs Man United" }),
        fixture,
        aliases,
      ),
    ).toBe(false);
  });

  it("descarta eventos con fecha muy lejana", () => {
    expect(
      legMatchesFixture(
        leg({ eventDate: new Date("2026-11-20T20:00:00.000Z") }),
        fixture,
        aliases,
      ),
    ).toBe(false);
  });
});

describe("agregado de comunidad", () => {
  it("cuenta usuarios distintos, 1X2 y totales", () => {
    const aggregate = aggregateCommunityForFixture(
      [
        leg({
          userId: "u1",
          selections: [
            { marketKey: "MATCH_RESULT", pick: "HOME", line: null },
            { marketKey: "TOTAL_GOALS", pick: "OVER", line: 2.5 },
          ],
        }),
        leg({
          userId: "u2",
          selections: [
            { marketKey: "MATCH_RESULT", pick: "HOME", line: null },
          ],
        }),
        leg({
          userId: "u3",
          selections: [
            { marketKey: "MATCH_RESULT", pick: "AWAY", line: null },
          ],
        }),
        leg({
          userId: "u4",
          selections: [
            { marketKey: "MATCH_RESULT", pick: "DRAW", line: null },
          ],
        }),
        leg({
          userId: "u5",
          selections: [
            { marketKey: "MATCH_RESULT", pick: "HOME", line: null },
          ],
        }),
      ],
      fixture,
      aliases,
    );
    expect(aggregate.users).toBe(5);
    expect(aggregate.picks).toBe(6);
    expect(aggregate.probabilities?.home).toBeCloseTo(3 / 5, 10);
    expect(aggregate.totals?.over25).toBe(1);
  });

  it("excluye a quien desactivó el agregado anónimo", () => {
    const aggregate = aggregateCommunityForFixture(
      [
        leg({ userId: "u1" }),
        leg({ userId: "u2", shareAnonymousStats: false }),
        leg({ userId: "u3" }),
        leg({ userId: "u4" }),
        leg({ userId: "u5" }),
      ],
      fixture,
      aliases,
    );
    expect(aggregate.users).toBe(4);
    expect(aggregate.excludedUsers).toBe(1);
  });

  it("el historial propio no aplica el opt-in", () => {
    const aggregate = aggregatePrivateForFixture(
      [
        leg({ userId: "me", shareAnonymousStats: false }),
        leg({ userId: "other" }),
      ],
      fixture,
      aliases,
      "me",
    );
    expect(aggregate.users).toBe(1);
    expect(aggregate.probabilities?.home).toBe(1);
  });
});
