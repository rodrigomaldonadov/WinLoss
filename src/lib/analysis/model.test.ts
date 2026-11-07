import { describe, expect, it } from "vitest";

import { fitRatings, predictMatch, scoreMatrix } from "./model";

function syntheticMatches() {
  const matches: {
    homeTeamId: string;
    awayTeamId: string;
    homeGoals: number;
    awayGoals: number;
    playedAt: Date;
  }[] = [];
  const base = Date.UTC(2023, 0, 7, 12);
  let round = 0;
  for (let repetition = 0; repetition < 20; repetition += 1) {
    for (const home of ["A", "B", "C", "D"]) {
      for (const away of ["A", "B", "C", "D"]) {
        if (home === away) continue;
        const strongHome = home === "A" || home === "B";
        const strongAway = away === "A" || away === "B";
        let homeGoals: number;
        let awayGoals: number;
        if (strongHome && strongAway) {
          homeGoals = 2;
          awayGoals = 1;
        } else if (strongHome) {
          homeGoals = 3;
          awayGoals = 0;
        } else if (strongAway) {
          homeGoals = 0;
          awayGoals = 2;
        } else {
          homeGoals = 1;
          awayGoals = 1;
        }
        matches.push({
          homeTeamId: home,
          awayTeamId: away,
          homeGoals,
          awayGoals,
          playedAt: new Date(base + round * 3 * 86_400_000),
        });
      }
    }
    round += 1;
  }
  return matches;
}

describe("fitRatings", () => {
  const matches = syntheticMatches();
  const asOf = new Date(Date.UTC(2024, 0, 1));
  const ratings = fitRatings(matches, {
    asOf,
    halfLifeDays: 365,
    ridge: 5,
  });

  it("ajusta ataque y defensa coherentes", () => {
    const strong = ratings.teams.get("A");
    const weak = ratings.teams.get("C");
    expect(strong).toBeDefined();
    expect(weak).toBeDefined();
    expect(strong!.attack).toBeGreaterThan(weak!.attack);
    expect(strong!.defense).toBeLessThan(weak!.defense);
    expect(ratings.homeAdvantage).toBeGreaterThan(0);
    expect(ratings.sample).toBe(matches.length);
  });

  it("produce una matriz de marcadores normalizada", () => {
    const matrix = scoreMatrix(ratings, "A", "C");
    const total = matrix.probabilities
      .flat()
      .reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("predice más victoria local para el equipo fuerte", () => {
    const probabilities = predictMatch(ratings, "A", "C");
    expect(probabilities.home).toBeGreaterThan(0.5);
    expect(probabilities.home + probabilities.draw + probabilities.away).toBeCloseTo(
      1,
      6,
    );
    expect(probabilities.over25 + probabilities.under25).toBeCloseTo(1, 6);
    expect(probabilities.expectedHomeGoals).toBeGreaterThan(
      probabilities.expectedAwayGoals,
    );
  });

  it("es determinista", () => {
    const again = fitRatings(matches, {
      asOf,
      halfLifeDays: 365,
      ridge: 5,
    });
    expect(again.homeAdvantage).toBeCloseTo(ratings.homeAdvantage, 10);
    expect(again.rho).toBeCloseTo(ratings.rho, 10);
  });

  it("no usa partidos posteriores a la fecha de corte", () => {
    const early = fitRatings(matches, {
      asOf: new Date(Date.UTC(2023, 2, 1)),
      halfLifeDays: 365,
      ridge: 5,
    });
    expect(early.sample).toBeLessThan(matches.length);
  });
});
