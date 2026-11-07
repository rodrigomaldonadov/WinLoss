import type { ScoreMatrix } from "@/lib/analysis/model";

export type ModelMarkets = {
  home: number;
  draw: number;
  away: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
};

export type TopScore = {
  home: number;
  away: number;
  probability: number;
};

export function topScoresFromMatrix(
  matrix: ScoreMatrix,
  limit = 5,
): TopScore[] {
  const scores: TopScore[] = [];
  for (let home = 0; home <= matrix.maxGoals; home += 1) {
    for (let away = 0; away <= matrix.maxGoals; away += 1) {
      scores.push({
        home,
        away,
        probability: matrix.probabilities[home]?.[away] ?? 0,
      });
    }
  }
  return scores
    .sort((left, right) => right.probability - left.probability)
    .slice(0, limit);
}

export function modelMarketsFromMatrix(matrix: ScoreMatrix): ModelMarkets {
  let home = 0;
  let draw = 0;
  let away = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let btts = 0;

  for (let homeGoals = 0; homeGoals <= matrix.maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= matrix.maxGoals; awayGoals += 1) {
      const probability = matrix.probabilities[homeGoals]?.[awayGoals] ?? 0;
      const total = homeGoals + awayGoals;
      if (homeGoals > awayGoals) home += probability;
      else if (homeGoals === awayGoals) draw += probability;
      else away += probability;
      if (total >= 2) over15 += probability;
      if (total >= 3) over25 += probability;
      if (total >= 4) over35 += probability;
      if (homeGoals > 0 && awayGoals > 0) btts += probability;
    }
  }

  return { home, draw, away, over15, over25, over35, btts };
}
