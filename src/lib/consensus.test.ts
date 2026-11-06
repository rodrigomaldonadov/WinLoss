import { describe, expect, it } from "vitest";

import {
  aggregateConsensus,
  type ConsensusHistoryLegInput,
  type ConsensusLegInput,
} from "./consensus";

const NOW = new Date(2026, 10, 6, 12, 0, 0);

function leg(
  overrides: Partial<ConsensusLegInput> & {
    userId: string;
    eventName: string;
    selections: ConsensusLegInput["selections"];
  },
): ConsensusLegInput {
  return {
    eventDate: new Date(2026, 10, 7, 20, 0, 0),
    sport: "Fútbol",
    competition: "Liga 1",
    odds: 1.8,
    isBuilder: false,
    ...overrides,
  };
}

function historyLeg(
  status: ConsensusHistoryLegInput["status"],
  selection: ConsensusHistoryLegInput["selections"][number],
  odds = 1.8,
  isBuilder = false,
): ConsensusHistoryLegInput {
  return {
    odds,
    isBuilder,
    status,
    selections: [selection],
  };
}

const homeSelection: ConsensusLegInput["selections"][number] = {
  market: "Resultado final (1X2)",
  selection: "Alianza Lima",
  marketKey: "MATCH_RESULT",
  line: null,
  pick: "HOME",
  subject: null,
};

describe("aggregateConsensus", () => {
  it("agrupa picks del mismo partido y calcula consenso", () => {
    const result = aggregateConsensus(
      [
        leg({
          userId: "user-1",
          eventName: "Alianza Lima vs Universitario",
          odds: 1.8,
          selections: [
            {
              market: "Resultado final (1X2)",
              selection: "Alianza Lima",
              marketKey: "MATCH_RESULT",
              line: null,
              pick: "HOME",
              subject: null,
            },
          ],
        }),
        leg({
          userId: "user-2",
          eventName: "Alianza Lima vs Universitario",
          odds: 2,
          selections: [
            {
              market: "Resultado final (1X2)",
              selection: "Alianza Lima",
              marketKey: "MATCH_RESULT",
              line: null,
              pick: "HOME",
              subject: null,
            },
            {
              market: "Total de goles",
              selection: "Más de 2.5",
              marketKey: "TOTAL_GOALS",
              line: 2.5,
              pick: "OVER",
              subject: null,
            },
          ],
        }),
        leg({
          userId: "user-3",
          eventName: "Alianza Lima vs Universitario",
          odds: 3.2,
          selections: [
            {
              market: "Resultado final (1X2)",
              selection: "Empate",
              marketKey: "MATCH_RESULT",
              line: null,
              pick: "DRAW",
              subject: null,
            },
          ],
        }),
      ],
      { now: NOW, days: 7 },
    );

    expect(result.matches).toHaveLength(1);
    expect(result.totalPicks).toBe(4);
    expect(result.totalUsers).toBe(3);

    const match = result.matches[0]!;
    expect(match.users).toBe(3);
    expect(match.picks).toBe(4);
    expect(match.primary.label).toBe("Resultado final");
    expect(match.primary.total).toBe(3);
    expect(match.primary.leader.label).toBe("Alianza Lima");
    expect(match.primary.leader.count).toBe(2);
    expect(match.primary.leader.share).toBeCloseTo(2 / 3, 4);
    expect(match.primary.leader.averageOdds).toBe(1.9);
    expect(match.markets[1]?.label).toBe("Total de goles 2.5");
  });

  it("cuenta varias selecciones de un builder sin duplicar usuarios", () => {
    const result = aggregateConsensus(
      [
        leg({
          userId: "user-1",
          eventName: "Real Madrid vs Barcelona",
          isBuilder: true,
          odds: 3.5,
          selections: [
            {
              market: "Total de goles",
              selection: "Más de 2.5",
              marketKey: "TOTAL_GOALS",
              line: 2.5,
              pick: "OVER",
              subject: null,
            },
            {
              market: "Ambos equipos marcan",
              selection: "Sí",
              marketKey: "BTTS",
              line: null,
              pick: "YES",
              subject: null,
            },
          ],
        }),
      ],
      { now: NOW, days: 7 },
    );

    const match = result.matches[0]!;
    expect(match.picks).toBe(2);
    expect(match.users).toBe(1);
    expect(match.markets).toHaveLength(2);
    // Un builder no aporta una cuota por selección.
    expect(match.averageOdds).toBeNull();
  });

  it("ignora partidos pasados o fuera de la ventana", () => {
    const result = aggregateConsensus(
      [
        leg({
          userId: "user-1",
          eventName: "Pasado vs Ayer",
          eventDate: new Date(2026, 10, 5, 20, 0, 0),
          selections: [
            {
              market: "Resultado final (1X2)",
              selection: "Pasado",
              marketKey: "MATCH_RESULT",
              line: null,
              pick: "HOME",
              subject: null,
            },
          ],
        }),
        leg({
          userId: "user-1",
          eventName: "Lejano vs Futuro",
          eventDate: new Date(2026, 11, 20, 20, 0, 0),
          selections: [
            {
              market: "Resultado final (1X2)",
              selection: "Lejano",
              marketKey: "MATCH_RESULT",
              line: null,
              pick: "HOME",
              subject: null,
            },
          ],
        }),
      ],
      { now: NOW, days: 7 },
    );

    expect(result.matches).toEqual([]);
    expect(result.totalPicks).toBe(0);
  });

  it("normaliza nombres con acentos y mayúsculas", () => {
    const selection = {
      market: "Resultado final (1X2)",
      selection: "París",
      marketKey: "MATCH_RESULT" as const,
      line: null,
      pick: "HOME",
      subject: null,
    };

    const result = aggregateConsensus(
      [
        leg({
          userId: "user-1",
          eventName: "París Saint Germain vs Marsella",
          selections: [selection],
        }),
        leg({
          userId: "user-2",
          eventName: "PARIS SAINT GERMAIN vs Marsella",
          selections: [selection],
        }),
      ],
      { now: NOW, days: 7 },
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.picks).toBe(2);
  });

  it("agrupa mercados personalizados por texto", () => {
    const result = aggregateConsensus(
      [
        leg({
          userId: "user-1",
          eventName: "Equipo A vs Equipo B",
          selections: [
            {
              market: "Tiros a puerta",
              selection: "Más de 10.5",
              marketKey: "CUSTOM",
              line: null,
              pick: null,
              subject: null,
            },
          ],
        }),
        leg({
          userId: "user-2",
          eventName: "Equipo A vs Equipo B",
          selections: [
            {
              market: "tiros a puerta",
              selection: "Más de 10.5",
              marketKey: "CUSTOM",
              line: null,
              pick: null,
              subject: null,
            },
          ],
        }),
      ],
      { now: NOW, days: 7 },
    );

    const market = result.matches[0]?.markets[0];
    expect(market?.label).toBe("Tiros a puerta");
    expect(market?.total).toBe(2);
    expect(market?.leader.count).toBe(2);
  });

  it("no expone identificadores de usuario en el resultado", () => {
    const result = aggregateConsensus(
      [
        leg({
          userId: "user-secreto@example.com",
          eventName: "Equipo A vs Equipo B",
          selections: [
            {
              market: "Resultado final (1X2)",
              selection: "Equipo A",
              marketKey: "MATCH_RESULT",
              line: null,
              pick: "HOME",
              subject: null,
            },
          ],
        }),
      ],
      { now: NOW, days: 7 },
    );

    expect(JSON.stringify(result)).not.toContain("secreto");
    expect(result.matches[0]?.users).toBe(1);
  });
});

describe("modelo de probabilidad", () => {
  const eventName = "Alianza Lima vs Universitario";
  const drawSelection: ConsensusLegInput["selections"][number] = {
    market: "Resultado final (1X2)",
    selection: "Empate",
    marketKey: "MATCH_RESULT",
    line: null,
    pick: "DRAW",
    subject: null,
  };
  const awaySelection: ConsensusLegInput["selections"][number] = {
    market: "Resultado final (1X2)",
    selection: "Universitario",
    marketKey: "MATCH_RESULT",
    line: null,
    pick: "AWAY",
    subject: null,
  };

  it("normaliza la probabilidad implícita de las cuotas", () => {
    const result = aggregateConsensus(
      [
        leg({
          userId: "u1",
          eventName,
          odds: 2,
          selections: [homeSelection],
        }),
        leg({
          userId: "u2",
          eventName,
          odds: 4,
          selections: [drawSelection],
        }),
        leg({
          userId: "u3",
          eventName,
          odds: 4,
          selections: [awaySelection],
        }),
      ],
      { now: NOW, days: 7 },
    );

    const primary = result.matches[0]!.primary;
    expect(primary.hasDistribution).toBe(true);
    const sum = primary.options.reduce(
      (total, option) => total + (option.probability ?? 0),
      0,
    );
    expect(sum).toBeCloseTo(1, 3);

    const home = primary.options.find((option) => option.key === "HOME");
    expect(home?.marketProbability).toBeCloseTo(0.5, 2);
    expect(home?.probability).toBeGreaterThan(0.45);
  });

  it("mejora la probabilidad cuando el histórico respalda la opción", () => {
    const pending = [
      leg({ userId: "u1", eventName, odds: 2, selections: [homeSelection] }),
      leg({ userId: "u2", eventName, odds: 2, selections: [homeSelection] }),
      leg({ userId: "u3", eventName, odds: 2, selections: [homeSelection] }),
      leg({ userId: "u4", eventName, odds: 2, selections: [drawSelection] }),
    ];

    const withoutHistory = aggregateConsensus(pending, {
      now: NOW,
      days: 7,
    });
    const history = [
      ...Array.from({ length: 10 }, () =>
        historyLeg("WON", homeSelection, 2),
      ),
      ...Array.from({ length: 2 }, () =>
        historyLeg("LOST", homeSelection, 2),
      ),
    ];
    const withHistory = aggregateConsensus(pending, {
      now: NOW,
      days: 7,
      history,
    });

    const before = withoutHistory.matches[0]?.primary.options.find(
      (option) => option.key === "HOME",
    );
    const after = withHistory.matches[0]?.primary.options.find(
      (option) => option.key === "HOME",
    );

    expect(after?.historySettled).toBe(12);
    expect(after?.historyRate).toBeCloseTo(10 / 12, 2);
    expect(after!.probability!).toBeGreaterThan(before!.probability!);
    expect(withHistory.history[0]).toMatchObject({
      marketLabel: "Resultado final",
      optionLabel: "Local",
      wins: 10,
      settled: 12,
    });
  });

  it("excluye builders del histórico por selección", () => {
    const result = aggregateConsensus([], {
      now: NOW,
      days: 7,
      history: [historyLeg("WON", homeSelection, 1.8, true)],
    });

    expect(result.history).toEqual([]);
  });

  it("cuenta media ganada como 0.5 en el histórico", () => {
    const result = aggregateConsensus([], {
      now: NOW,
      days: 7,
      history: [
        historyLeg("HALF_WON", homeSelection, 2),
        historyLeg("LOST", homeSelection, 2),
      ],
    });

    expect(result.history[0]).toMatchObject({
      wins: 0.5,
      settled: 2,
      rate: 0.25,
    });
  });

  it("no inventa probabilidad si no hay cuota ni histórico", () => {
    const result = aggregateConsensus(
      [
        leg({
          userId: "u1",
          eventName,
          odds: 0,
          selections: [
            {
              market: "Total de goles",
              selection: "Más de 2.5",
              marketKey: "TOTAL_GOALS",
              line: 2.5,
              pick: "OVER",
              subject: null,
            },
          ],
        }),
      ],
      { now: NOW, days: 7 },
    );

    const primary = result.matches[0]!.primary;
    expect(primary.hasDistribution).toBe(false);
    expect(primary.leader.probability).toBeNull();
  });

  it("estima probabilidad en un mercado de una sola opción si hay cuota", () => {
    const result = aggregateConsensus(
      [
        leg({
          userId: "u1",
          eventName,
          odds: 1.9,
          selections: [
            {
              market: "Total de goles",
              selection: "Más de 2.5",
              marketKey: "TOTAL_GOALS",
              line: 2.5,
              pick: "OVER",
              subject: null,
            },
          ],
        }),
      ],
      { now: NOW, days: 7 },
    );

    const primary = result.matches[0]!.primary;
    expect(primary.hasDistribution).toBe(false);
    expect(primary.leader.probability).not.toBeNull();
    expect(primary.leader.probability!).toBeGreaterThan(0.4);
  });
});
