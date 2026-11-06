import { describe, expect, it } from "vitest";

import {
  aggregateConsensus,
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
