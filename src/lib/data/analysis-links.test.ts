import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { resolveHistoryMatchIds, type AnalysisLinkLeg } from "./analysis-links";

const playedAt = new Date("2026-11-07T20:00:00.000Z");

type SnapshotRow = {
  externalEventId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeName: string;
  awayName: string;
  kickoff: Date;
  snapshotAt: Date;
};

type TeamRow = { id: string; normalizedName: string };

type MatchRow = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  playedAt: Date;
};

function makeClient({
  snapshots = [],
  teams = [],
  matches = [],
}: {
  snapshots?: SnapshotRow[];
  teams?: TeamRow[];
  matches?: MatchRow[];
}) {
  const analysisSnapshot = {
    findMany: vi.fn(
      async (args: { where: { externalEventId: { in: string[] } } }) => {
        const ids = new Set(args.where.externalEventId.in);
        return snapshots.filter(
          (snapshot) =>
            snapshot.externalEventId && ids.has(snapshot.externalEventId),
        );
      },
    ),
  };
  const team = {
    findMany: vi.fn(async (args: { where: { normalizedName: { in: string[] } } }) => {
      const keys = new Set(args.where.normalizedName.in);
      return teams.filter((row) => keys.has(row.normalizedName));
    }),
  };
  const historicalMatch = {
    findMany: vi.fn(
      async (args: {
        where: {
          playedAt: { gte: Date; lte: Date };
          OR: { homeTeamId: string; awayTeamId: string }[];
        };
      }) =>
        matches.filter((match) => {
          const inRange =
            match.playedAt >= args.where.playedAt.gte &&
            match.playedAt <= args.where.playedAt.lte;
          const pair = args.where.OR.some(
            (item) =>
              item.homeTeamId === match.homeTeamId &&
              item.awayTeamId === match.awayTeamId,
          );
          return inRange && pair;
        }),
    ),
  };

  return {
    client: { analysisSnapshot, team, historicalMatch } as unknown as PrismaClient,
    analysisSnapshot,
    team,
    historicalMatch,
  };
}

function leg(overrides: Partial<AnalysisLinkLeg> = {}): AnalysisLinkLeg {
  return {
    id: "leg-1",
    eventName: "Arsenal vs Chelsea",
    eventDate: playedAt,
    externalEventId: null,
    homeTeam: null,
    awayTeam: null,
    ...overrides,
  };
}

describe("resolveHistoryMatchIds", () => {
  it("usa el snapshot del externalEventId para encontrar el partido", async () => {
    const { client } = makeClient({
      snapshots: [
        {
          externalEventId: "evt-1",
          homeTeamId: "arsenal",
          awayTeamId: "chelsea",
          homeName: "Arsenal",
          awayName: "Chelsea",
          kickoff: playedAt,
          snapshotAt: new Date("2026-11-07T18:00:00.000Z"),
        },
      ],
      matches: [
        { id: "match-1", homeTeamId: "arsenal", awayTeamId: "chelsea", playedAt },
      ],
    });

    const links = await resolveHistoryMatchIds(
      [leg({ externalEventId: "evt-1" })],
      client,
    );

    expect(links.get("leg-1")).toBe("match-1");
  });

  it("cae a los nombres con alias cuando no hay snapshot", async () => {
    const { client } = makeClient({
      teams: [
        { id: "man-united", normalizedName: "man united" },
        { id: "chelsea", normalizedName: "chelsea" },
      ],
      matches: [
        {
          id: "match-2",
          // Orden invertido respecto del leg: se permite.
          homeTeamId: "chelsea",
          awayTeamId: "man-united",
          playedAt,
        },
      ],
    });

    const links = await resolveHistoryMatchIds(
      [
        leg({
          id: "leg-2",
          eventName: "Man Utd vs Chelsea",
          homeTeam: null,
          awayTeam: null,
        }),
      ],
      client,
    );

    expect(links.get("leg-2")).toBe("match-2");
  });

  it("descarta partidos fuera de la tolerancia de dos días", async () => {
    const { client } = makeClient({
      teams: [
        { id: "arsenal", normalizedName: "arsenal" },
        { id: "chelsea", normalizedName: "chelsea" },
      ],
      matches: [
        {
          id: "match-3",
          homeTeamId: "arsenal",
          awayTeamId: "chelsea",
          playedAt: new Date("2026-11-12T20:00:00.000Z"),
        },
      ],
    });

    const links = await resolveHistoryMatchIds([leg({ id: "leg-3" })], client);
    expect(links.has("leg-3")).toBe(false);
  });

  it("ignora legs sin evento identificable", async () => {
    const { client } = makeClient({});

    const links = await resolveHistoryMatchIds(
      [leg({ id: "leg-4", eventName: "Partido sin equipos", eventDate: null })],
      client,
    );

    expect(links.size).toBe(0);
  });
});
