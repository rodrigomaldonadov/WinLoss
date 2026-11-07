import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_HISTORY_FILTERS,
  type HistoryFilterState,
} from "@/lib/analysis/history";

import {
  getAnalysisHistory,
  getHistoryMatchHeader,
  getRecentResults,
  searchAnalysisTeams,
} from "./analysis-history";

const LIMA = "America/Lima";

type SnapshotFixture = {
  matchKey: string;
  snapshotAt: Date;
  kickoff: Date;
  finalProbability: {
    home: number;
    draw: number;
    away: number;
    over25?: number;
    under25?: number;
  } | null;
  markets?: { btts?: number } | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
  externalEventId?: string | null;
};

type RowFixture = {
  id: string;
  competition: string;
  competitionCode: string | null;
  playedAt: Date;
  homeGoals: number;
  awayGoals: number;
  provisional: boolean;
  source: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { canonicalName: string };
  awayTeam: { canonicalName: string };
};

function row({
  id,
  home,
  away,
  playedAt,
  homeGoals = 2,
  awayGoals = 1,
}: {
  id: string;
  home: string;
  away: string;
  playedAt: Date;
  homeGoals?: number;
  awayGoals?: number;
}): RowFixture {
  return {
    id,
    competition: "Premier League",
    competitionCode: "E0",
    playedAt,
    homeGoals,
    awayGoals,
    provisional: false,
    source: "football-data.co.uk",
    homeTeamId: `team-${home.toLowerCase()}`,
    awayTeamId: `team-${away.toLowerCase()}`,
    homeTeam: { canonicalName: home },
    awayTeam: { canonicalName: away },
  };
}

function makeClient({
  rows,
  snapshots = [],
  legs = [],
  teams = [],
}: {
  rows: RowFixture[];
  snapshots?: SnapshotFixture[];
  legs?: { eventName: string; eventDate: Date | null; externalEventId?: string | null }[];
  teams?: { id: string; canonicalName: string }[];
}) {
  const historicalMatch = {
    count: vi.fn(async () => rows.length),
    findMany: vi.fn(async (args?: { skip?: number; take?: number }) => {
      const skip = args?.skip ?? 0;
      const take = args?.take ?? rows.length;
      return rows.slice(skip, skip + take);
    }),
    findUnique: vi.fn(
      async (args?: { where?: { id?: string } }) =>
        rows.find((row) => row.id === args?.where?.id) ?? null,
    ),
  };
  const analysisSnapshot = {
    findMany: vi.fn(
      async (args: {
        where: {
          matchKey?: string | { in: string[] };
          externalEventId?: { in: string[] };
        };
      }) => {
        if (typeof args.where.matchKey === "string") {
          return snapshots.filter(
            (snapshot) => snapshot.matchKey === args.where.matchKey,
          );
        }
        if (args.where.externalEventId) {
          const ids = new Set(args.where.externalEventId.in);
          return snapshots
            .filter(
              (snapshot) =>
                snapshot.externalEventId &&
                ids.has(snapshot.externalEventId),
            )
            .map((snapshot) => ({ matchKey: snapshot.matchKey }));
        }
        const keys = new Set(
          typeof args.where.matchKey === "object"
            ? args.where.matchKey.in
            : [],
        );
        return snapshots.filter((snapshot) => keys.has(snapshot.matchKey));
      },
    ),
  };
  const betLeg = {
    findMany: vi.fn(async () => legs),
  };
  const team = {
    findMany: vi.fn(async (args?: { where: unknown }) => {
      void args;
      return teams;
    }),
  };

  return {
    client: {
      historicalMatch,
      analysisSnapshot,
      betLeg,
      team,
    } as unknown as PrismaClient,
    historicalMatch,
    team,
  };
}

function filters(
  overrides: Partial<HistoryFilterState> = {},
): HistoryFilterState {
  return { ...EMPTY_HISTORY_FILTERS, ...overrides };
}

const arsenalChelsea = row({
  id: "m1",
  home: "Arsenal",
  away: "Chelsea",
  playedAt: new Date("2026-11-07T12:00:00.000Z"),
});
const liverpoolEverton = row({
  id: "m2",
  home: "Liverpool",
  away: "Everton",
  playedAt: new Date("2026-11-06T12:00:00.000Z"),
});
const arsenalTottenham = row({
  id: "m3",
  home: "Arsenal",
  away: "Tottenham",
  playedAt: new Date("2026-11-05T12:00:00.000Z"),
});

const savedSnapshot: SnapshotFixture = {
  matchKey: "arsenal|chelsea|2026-11-07",
  snapshotAt: new Date("2026-11-07T10:00:00.000Z"),
  kickoff: new Date("2026-11-07T12:00:00.000Z"),
  finalProbability: { home: 0.5, draw: 0.3, away: 0.2 },
  confidence: "HIGH",
};

describe("getAnalysisHistory", () => {
  it("marca guardada solo si la captura es anterior al inicio", async () => {
    const { client } = makeClient({
      rows: [arsenalChelsea, liverpoolEverton, arsenalTottenham],
      snapshots: [
        savedSnapshot,
        {
          // Captura posterior al inicio: no vale como "guardada".
          matchKey: "arsenal|tottenham|2026-11-05",
          snapshotAt: new Date("2026-11-05T13:00:00.000Z"),
          kickoff: new Date("2026-11-05T12:00:00.000Z"),
          finalProbability: { home: 0.4, draw: 0.3, away: 0.3 },
          confidence: "LOW",
        },
      ],
    });

    const result = await getAnalysisHistory({
      userId: "user-1",
      filters: filters(),
      timeZone: LIMA,
      client,
    });

    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.id)).toEqual(["m1", "m2", "m3"]);
    expect(result.items.map((item) => item.mode)).toEqual([
      "saved",
      "reconstructed",
      "reconstructed",
    ]);
    expect(result.items[0]?.prediction).toEqual({
      home: 0.5,
      draw: 0.3,
      away: 0.2,
    });
    expect(result.items[1]?.prediction).toBeNull();
  });

  it("filtra por modo guardada recorriendo el rango", async () => {
    const { client } = makeClient({
      rows: [arsenalChelsea, liverpoolEverton, arsenalTottenham],
      snapshots: [savedSnapshot],
    });

    const saved = await getAnalysisHistory({
      userId: "user-1",
      filters: filters({ mode: "saved" }),
      timeZone: LIMA,
      client,
    });
    expect(saved.total).toBe(1);
    expect(saved.items[0]?.id).toBe("m1");

    const reconstructed = await getAnalysisHistory({
      userId: "user-1",
      filters: filters({ mode: "reconstructed" }),
      timeZone: LIMA,
      client,
    });
    expect(reconstructed.items.map((item) => item.id)).toEqual(["m2", "m3"]);
  });

  it("cruza 'mis partidos' con los legs del usuario", async () => {
    const { client } = makeClient({
      rows: [arsenalChelsea, liverpoolEverton],
      legs: [
        {
          eventName: "Chelsea vs Arsenal",
          eventDate: new Date("2026-11-07T14:00:00.000Z"),
        },
      ],
    });

    const result = await getAnalysisHistory({
      userId: "user-1",
      filters: filters({ mine: true }),
      timeZone: LIMA,
      client,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe("m1");
    expect(result.items[0]?.hasBet).toBe(true);
  });

  it("liga la apuesta por externalEventId aunque el nombre no coincida", async () => {
    const { client } = makeClient({
      rows: [arsenalChelsea, liverpoolEverton],
      snapshots: [{ ...savedSnapshot, externalEventId: "evt-99" }],
      legs: [
        {
          eventName: "Evento sin equipos",
          eventDate: null,
          externalEventId: "evt-99",
        },
      ],
    });

    const result = await getAnalysisHistory({
      userId: "user-1",
      filters: filters({ mine: true }),
      timeZone: LIMA,
      client,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe("m1");
    expect(result.items[0]?.hasBet).toBe(true);
  });

  it("marca como provisional un resultado de la API", async () => {
    const { client } = makeClient({
      rows: [{ ...arsenalChelsea, source: "api", provisional: false }],
    });

    const result = await getAnalysisHistory({
      userId: "user-1",
      filters: filters(),
      timeZone: LIMA,
      client,
    });

    expect(result.items[0]?.provisional).toBe(true);
  });

  it("resuelve el equipo por alias antes de consultar", async () => {
    const { client, team } = makeClient({
      rows: [arsenalChelsea],
      teams: [{ id: "team-arsenal", canonicalName: "Arsenal" }],
    });

    const result = await getAnalysisHistory({
      userId: "user-1",
      filters: filters({ query: "arsenal" }),
      timeZone: LIMA,
      client,
    });

    expect(team.findMany).toHaveBeenCalledTimes(1);
    expect(result.matchedTeams).toEqual([
      { id: "team-arsenal", name: "Arsenal" },
    ]);
    expect(result.unknownTeam).toBe(false);
  });

  it("devuelve unknownTeam cuando el nombre no resuelve", async () => {
    const { client, historicalMatch } = makeClient({ rows: [arsenalChelsea] });

    const result = await getAnalysisHistory({
      userId: "user-1",
      filters: filters({ query: "equipo inexistente" }),
      timeZone: LIMA,
      client,
    });

    expect(result).toMatchObject({
      items: [],
      total: 0,
      unknownTeam: true,
    });
    expect(historicalMatch.findMany).not.toHaveBeenCalled();
  });

  it("convierte el rango de fechas desde la zona del usuario", async () => {
    const { client, historicalMatch } = makeClient({ rows: [arsenalChelsea] });

    await getAnalysisHistory({
      userId: "user-1",
      filters: filters({ from: "2026-11-01", to: "2026-11-07" }),
      timeZone: LIMA,
      client,
    });

    const args = historicalMatch.findMany.mock.calls[0]?.[0] as {
      where: { AND: { playedAt: { gte: Date; lte: Date } }[] };
    };
    expect(args.where.AND[0]?.playedAt.gte.toISOString()).toBe(
      "2026-11-01T05:00:00.000Z",
    );
    expect(args.where.AND[0]?.playedAt.lte.toISOString()).toBe(
      "2026-11-08T04:59:00.000Z",
    );
  });

  it("pagina y ajusta una página fuera de rango", async () => {
    const manyRows = Array.from({ length: 25 }, (_, index) =>
      row({
        id: `m${index}`,
        home: "Arsenal",
        away: `Rival ${index}`,
        playedAt: new Date(Date.UTC(2026, 10, 7 - index, 12)),
      }),
    );
    const { client, historicalMatch } = makeClient({ rows: manyRows });

    const result = await getAnalysisHistory({
      userId: "user-1",
      filters: filters({ page: 99 }),
      timeZone: LIMA,
      client,
    });

    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(2);
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(5);
    expect(historicalMatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });
});

describe("searchAnalysisTeams", () => {
  it("normaliza el nombre y busca por alias, sin sufijos de club", async () => {
    const { client, team } = makeClient({
      rows: [],
      teams: [{ id: "team-barcelona", canonicalName: "Barcelona" }],
    });

    const result = await searchAnalysisTeams("FC Barcelona", { client });

    expect(result).toEqual([
      { id: "team-barcelona", name: "Barcelona" },
    ]);

    const args = team.findMany.mock.calls[0]?.[0] as unknown as {
      where: {
        AND: {
          OR: {
            normalizedName?: { contains: string };
            aliases?: { some: { normalized: { contains: string } } };
          }[];
        }[];
      };
    };
    expect(args.where.AND[0]?.OR[0]).toEqual({
      normalizedName: { contains: "barcelona" },
    });
    expect(args.where.AND[0]?.OR[2]).toEqual({
      aliases: { some: { normalized: { contains: "barcelona" } } },
    });
  });

  it("no consulta la base con menos de dos caracteres", async () => {
    const { client, team } = makeClient({ rows: [] });

    expect(await searchAnalysisTeams("a", { client })).toEqual([]);
    expect(team.findMany).not.toHaveBeenCalled();
  });
});

describe("getHistoryMatchHeader", () => {
  it("devuelve el partido y si hay captura anterior al inicio", async () => {
    const { client } = makeClient({
      rows: [arsenalChelsea],
      snapshots: [savedSnapshot],
    });

    const header = await getHistoryMatchHeader("m1", client);

    expect(header).toMatchObject({
      id: "m1",
      homeName: "Arsenal",
      awayName: "Chelsea",
      homeGoals: 2,
      awayGoals: 1,
      provisional: false,
      hasSnapshot: true,
    });
  });

  it("ignora capturas posteriores al inicio", async () => {
    const { client } = makeClient({
      rows: [arsenalChelsea],
      snapshots: [
        {
          ...savedSnapshot,
          snapshotAt: new Date("2026-11-07T13:00:00.000Z"),
        },
      ],
    });

    const header = await getHistoryMatchHeader("m1", client);
    expect(header?.hasSnapshot).toBe(false);
  });

  it("devuelve null si el partido no existe", async () => {
    const { client } = makeClient({ rows: [arsenalChelsea] });
    expect(await getHistoryMatchHeader("no-existe", client)).toBeNull();
  });
});

describe("getRecentResults", () => {
  it("solo devuelve partidos con captura y sus mercados", async () => {
    const { client } = makeClient({
      rows: [arsenalChelsea, liverpoolEverton],
      snapshots: [
        {
          ...savedSnapshot,
          finalProbability: {
            home: 0.5,
            draw: 0.3,
            away: 0.2,
            over25: 0.55,
            under25: 0.45,
          },
          markets: { btts: 0.6 },
        },
      ],
    });

    const items = await getRecentResults({
      client,
      now: new Date("2026-11-09T00:00:00.000Z"),
      limit: 4,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("m1");
    expect(
      items[0]?.markets.map((market) => [
        market.key,
        market.occurred,
        market.probability,
      ]),
    ).toEqual([
      ["1x2", true, 0.5],
      ["over25", true, 0.55],
      ["btts", true, 0.6],
    ]);
  });

  it("omite mercados que la captura no guardó", async () => {
    const { client } = makeClient({
      rows: [arsenalChelsea],
      snapshots: [savedSnapshot],
    });

    const items = await getRecentResults({
      client,
      now: new Date("2026-11-09T00:00:00.000Z"),
    });

    expect(items[0]?.markets).toHaveLength(1);
    expect(items[0]?.markets[0]?.key).toBe("1x2");
  });
});




