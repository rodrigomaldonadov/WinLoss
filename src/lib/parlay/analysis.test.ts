import { describe, expect, it } from "vitest";

import {
  arbitrageFor,
  bestArbitrage,
  bestPriceFor,
  centsDifference,
  consensusFor,
  formatCents,
  impliedProbability,
  median,
  moneylineNoVig,
  noVig,
  propLines,
  sharpBook,
  type ParlayEvent,
} from "./analysis";

function event(overrides: Partial<ParlayEvent> = {}): ParlayEvent {
  return {
    id: "evt-1",
    sport_key: "basketball_nba",
    commence_time: "2026-11-11T00:30:00Z",
    home_team: "Home",
    away_team: "Away",
    bookmakers: [
      {
        key: "novig",
        title: "Novig",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Home", price: 1.91 },
              { name: "Away", price: 1.91 },
            ],
          },
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: 1.95, point: 220.5 },
              { name: "Under", price: 1.95, point: 220.5 },
            ],
          },
        ],
      },
      {
        key: "draftkings",
        title: "DraftKings",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Home", price: 1.87 },
              { name: "Away", price: 1.95 },
            ],
          },
          {
            key: "totals",
            outcomes: [
              { name: "Over", price: 2.1, point: 220.5 },
              { name: "Under", price: 2.1, point: 220.5 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("no-vig", () => {
  it("normaliza un mercado de dos resultados", () => {
    const result = noVig([
      { name: "Home", price: 1.91 },
      { name: "Away", price: 1.91 },
    ]);
    expect(result?.probabilities.Home).toBeCloseTo(0.5);
    expect(result?.probabilities.Away).toBeCloseTo(0.5);
    expect(result?.overround).toBeCloseTo(0.0471, 3);
  });

  it("normaliza un 1X2 con empate", () => {
    const result = noVig([
      { name: "Home", price: 2 },
      { name: "Draw", price: 3.5 },
      { name: "Away", price: 4 },
    ]);
    const sum = Object.values(result?.probabilities ?? {}).reduce(
      (total, value) => total + value,
      0,
    );
    expect(sum).toBeCloseTo(1);
    expect(result?.probabilities.Draw).toBeGreaterThan(
      result?.probabilities.Away ?? 0,
    );
  });

  it("ignora cuotas inválidas", () => {
    expect(
      noVig([
        { name: "Home", price: 1 },
        { name: "Away", price: 0 },
      ]),
    ).toBeNull();
  });
});

describe("consenso y sharp", () => {
  it("excluye la referencia sharp del consenso", () => {
    const books = moneylineNoVig(event());
    const consensus = consensusFor(books, ["Home", "Away"]);
    expect(consensus.Home).toBeCloseTo(0.5105, 3);
  });

  it("detecta la casa sharp", () => {
    const books = moneylineNoVig(event());
    expect(sharpBook(books)?.key).toBe("novig");
  });

  it("calcula la diferencia en centavos", () => {
    expect(centsDifference(0.52, 0.5)).toBeCloseTo(2);
    expect(formatCents(2.04)).toBe("+2.0 cents");
    expect(formatCents(-1.26)).toBe("-1.3 cents");
    expect(formatCents(null)).toBe("—");
  });

  it("usa la mediana", () => {
    expect(median([0.5, 0.52, 0.51])).toBeCloseTo(0.51);
    expect(median([0.5, 0.52])).toBeCloseTo(0.51);
    expect(median([])).toBeNull();
  });
});

describe("mejor cuota y arbitraje", () => {
  it("encuentra la mejor cuota y su casa", () => {
    const best = bestPriceFor(event(), "h2h", "Away");
    expect(best?.price).toBeCloseTo(1.95);
    expect(best?.book).toBe("DraftKings");
    expect(impliedProbability(2)).toBeCloseTo(0.5);
  });

  it("detecta arbitraje en totales cuando la suma baja de 1", () => {
    const result = arbitrageFor(event(), "totals", 220.5);
    expect(result?.sum).toBeLessThan(1);
    expect(result?.profitPct).toBeGreaterThan(0);
    expect(result?.legs.map((leg) => leg.book)).toEqual([
      "DraftKings",
      "DraftKings",
    ]);
  });

  it("ordena los mejores casos y marca el 1X2", () => {
    const cases = bestArbitrage(event(), 5);
    expect(cases[0]?.market).toBe("totals");
    expect(cases.some((item) => item.market === "h2h")).toBe(true);
  });

  it("no inventa arbitraje si falta un lado", () => {
    const broken = event({
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "totals",
              outcomes: [{ name: "Over", price: 1.9, point: 220.5 }],
            },
          ],
        },
      ],
    });
    expect(arbitrageFor(broken, "totals", 220.5)).toBeNull();
  });
});

describe("props", () => {
  it("elige la mejor cuota de Over y Under por jugador y línea", () => {
    const props = event({
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "player_points",
              outcomes: [
                { name: "Over Player A", description: "Player A", price: 1.9, point: 24.5 },
                { name: "Under Player A", description: "Player A", price: 1.95, point: 24.5 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "player_points",
              outcomes: [
                { name: "Over Player A", description: "Player A", price: 2.0, point: 24.5 },
                { name: "Under Player A", description: "Player A", price: 1.9, point: 24.5 },
              ],
            },
          ],
        },
      ],
    });

    const lines = propLines(props, "player_points");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.player).toBe("Player A");
    expect(lines[0]?.over?.price).toBeCloseTo(2);
    expect(lines[0]?.over?.book).toBe("FanDuel");
    expect(lines[0]?.under?.price).toBeCloseTo(1.95);
    expect(lines[0]?.under?.book).toBe("DraftKings");
  });
});
