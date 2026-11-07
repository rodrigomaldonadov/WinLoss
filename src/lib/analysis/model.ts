/**
 * Modelo Poisson de fuerzas de equipo con decaimiento temporal, shrinkage y
 * corrección Dixon-Coles para marcadores bajos.
 *
 * Es deliberadamente simple: se ajusta por liga, sin información de mercado ni
 * estadísticas de partido. El backtest decide si es suficientemente bueno antes
 * de usarlo como fuente en /analysis.
 */

const LOG_FACTORIAL = (() => {
  const values = [0];
  for (let index = 1; index <= 20; index += 1) {
    values[index] = (values[index - 1] ?? 0) + Math.log(index);
  }
  return values;
})();

export type ModelMatch = {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  playedAt: Date;
};

export type FitOptions = {
  /** Fecha de corte: solo se usan partidos anteriores. */
  asOf: Date;
  /** Vida media del peso temporal, en días. 0 desactiva el decaimiento. */
  halfLifeDays?: number;
  /** Penalización ridge por parámetro. 0 desactiva el shrinkage. */
  ridge?: number;
  iterations?: number;
  learningRate?: number;
  maxGoals?: number;
  /** Arranque en caliente para refits semanales. */
  initial?: Pick<Ratings, "teams" | "homeAdvantage">;
};

export type TeamStrength = {
  attack: number;
  defense: number;
  matches: number;
  weight: number;
};

export type Ratings = {
  teams: Map<string, TeamStrength>;
  homeAdvantage: number;
  rho: number;
  asOf: Date;
  sample: number;
  effectiveSample: number;
  leagueAvgHomeGoals: number;
  leagueAvgAwayGoals: number;
  halfLifeDays: number;
  ridge: number;
};

export type MatchProbabilities = {
  home: number;
  draw: number;
  away: number;
  over25: number;
  under25: number;
  btts: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
};

export type ScoreMatrix = {
  probabilities: number[][];
  maxGoals: number;
};

const DEFAULT_OPTIONS = {
  halfLifeDays: 365,
  ridge: 70,
  iterations: 400,
  learningRate: 1,
  maxGoals: 10,
} satisfies Required<Omit<FitOptions, "asOf" | "initial">>;

function decayWeight(
  playedAt: Date,
  asOf: Date,
  halfLifeDays: number,
): number {
  if (halfLifeDays <= 0) return 1;
  const ageDays = Math.max(
    0,
    (asOf.getTime() - playedAt.getTime()) / 86_400_000,
  );
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function percentage(
  numerator: number,
  denominator: number,
  fallback: number,
): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return fallback;
  }
  if (denominator <= 0) return fallback;
  return numerator / denominator;
}

/**
 * Ajusta ataque/defensa por máxima verosimilitud Poisson ponderada.
 * La actualización usa el gradiente natural (dividido por la información de
 * Poisson), que converge rápido sin depender de un paso minúsculo.
 */
export function fitRatings(
  matches: ModelMatch[],
  options: FitOptions,
): Ratings {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const usable = matches.filter(
    (match) =>
      match.playedAt.getTime() < options.asOf.getTime() &&
      Number.isFinite(match.homeGoals) &&
      Number.isFinite(match.awayGoals) &&
      match.homeGoals >= 0 &&
      match.awayGoals >= 0,
  );

  const teamIds = new Set<string>();
  for (const match of usable) {
    teamIds.add(match.homeTeamId);
    teamIds.add(match.awayTeamId);
  }
  const index = new Map<string, number>();
  const ids = [...teamIds];
  ids.forEach((id, position) => index.set(id, position));

  const size = ids.length;
  const attack = new Float64Array(size);
  const defense = new Float64Array(size);
  const appearances = new Int32Array(size);
  const weightSum = new Float64Array(size);

  const weights = new Float64Array(usable.length);
  let totalGoalsHome = 0;
  let totalGoalsAway = 0;
  let totalWeight = 0;
  let effectiveSample = 0;

  for (let position = 0; position < usable.length; position += 1) {
    const match = usable[position]!;
    const weight = decayWeight(
      match.playedAt,
      options.asOf,
      config.halfLifeDays,
    );
    weights[position] = weight;
    totalGoalsHome += match.homeGoals * weight;
    totalGoalsAway += match.awayGoals * weight;
    totalWeight += weight;
    effectiveSample += weight;

    const home = index.get(match.homeTeamId)!;
    const away = index.get(match.awayTeamId)!;
    appearances[home] = (appearances[home] ?? 0) + 1;
    appearances[away] = (appearances[away] ?? 0) + 1;
    weightSum[home] = (weightSum[home] ?? 0) + weight;
    weightSum[away] = (weightSum[away] ?? 0) + weight;
  }

  const leagueAvgHomeGoals = percentage(
    totalGoalsHome,
    totalWeight,
    1.4,
  );
  const leagueAvgAwayGoals = percentage(
    totalGoalsAway,
    totalWeight,
    1.1,
  );
  let homeAdvantage = Math.log(
    Math.max(0.05, leagueAvgHomeGoals) / Math.max(0.05, leagueAvgAwayGoals),
  );

  if (config.initial) {
    homeAdvantage = config.initial.homeAdvantage;
    for (let team = 0; team < size; team += 1) {
      const previous = config.initial.teams.get(ids[team]!);
      if (!previous) continue;
      attack[team] = previous.attack;
      defense[team] = previous.defense;
    }
  }

  const gradientAttack = new Float64Array(size);
  const denominatorAttack = new Float64Array(size);
  const gradientDefense = new Float64Array(size);
  const denominatorDefense = new Float64Array(size);

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    gradientAttack.fill(0);
    denominatorAttack.fill(0);
    gradientDefense.fill(0);
    denominatorDefense.fill(0);
    let gradientHomeAdvantage = 0;
    let denominatorHomeAdvantage = 0;

    for (let position = 0; position < usable.length; position += 1) {
      const match = usable[position]!;
      const weight = weights[position]!;
      const home = index.get(match.homeTeamId)!;
      const away = index.get(match.awayTeamId)!;

      const expectedHome = Math.exp(
        (attack[home] ?? 0) + (defense[away] ?? 0) + homeAdvantage,
      );
      const expectedAway = Math.exp(
        (attack[away] ?? 0) + (defense[home] ?? 0),
      );

      const homeResidual = weight * (match.homeGoals - expectedHome);
      gradientAttack[home] = (gradientAttack[home] ?? 0) + homeResidual;
      denominatorAttack[home] =
        (denominatorAttack[home] ?? 0) + weight * expectedHome;
      gradientDefense[away] = (gradientDefense[away] ?? 0) + homeResidual;
      denominatorDefense[away] =
        (denominatorDefense[away] ?? 0) + weight * expectedHome;

      const awayResidual = weight * (match.awayGoals - expectedAway);
      gradientAttack[away] = (gradientAttack[away] ?? 0) + awayResidual;
      denominatorAttack[away] =
        (denominatorAttack[away] ?? 0) + weight * expectedAway;
      gradientDefense[home] = (gradientDefense[home] ?? 0) + awayResidual;
      denominatorDefense[home] =
        (denominatorDefense[home] ?? 0) + weight * expectedAway;

      gradientHomeAdvantage +=
        weight * (match.homeGoals - expectedHome);
      denominatorHomeAdvantage += weight * expectedHome;
    }

    let maxDelta = 0;
    for (let team = 0; team < size; team += 1) {
      const attackDelta =
        config.learningRate *
        ((gradientAttack[team] ?? 0) - config.ridge * (attack[team] ?? 0)) /
        ((denominatorAttack[team] ?? 0) + config.ridge);
      const defenseDelta =
        config.learningRate *
        ((gradientDefense[team] ?? 0) - config.ridge * (defense[team] ?? 0)) /
        ((denominatorDefense[team] ?? 0) + config.ridge);
      attack[team] = (attack[team] ?? 0) + attackDelta;
      defense[team] = (defense[team] ?? 0) + defenseDelta;
      maxDelta = Math.max(
        maxDelta,
        Math.abs(attackDelta),
        Math.abs(defenseDelta),
      );
    }

    const homeDelta =
      config.learningRate *
      (gradientHomeAdvantage - config.ridge * homeAdvantage) /
      (denominatorHomeAdvantage + config.ridge);
    homeAdvantage += homeDelta;
    maxDelta = Math.max(maxDelta, Math.abs(homeDelta));

    // Identificabilidad: sumar una constante a todos los ataques y restarla de
    // todas las defensas deja las medias intactas.
    let meanAttack = 0;
    let meanDefense = 0;
    for (let team = 0; team < size; team += 1) {
      meanAttack += attack[team] ?? 0;
      meanDefense += defense[team] ?? 0;
    }
    meanAttack = size > 0 ? meanAttack / size : 0;
    meanDefense = size > 0 ? meanDefense / size : 0;
    if (size > 0) {
      for (let team = 0; team < size; team += 1) {
        attack[team] = (attack[team] ?? 0) - meanAttack + meanDefense;
        defense[team] = (defense[team] ?? 0) + meanAttack - meanDefense;
      }
    }

    if (maxDelta < 1e-7) break;
  }

  const rho = fitRho(usable, weights, index, attack, defense, homeAdvantage);

  const teams = new Map<string, TeamStrength>();
  for (let team = 0; team < size; team += 1) {
    const id = ids[team]!;
    teams.set(id, {
      attack: attack[team] ?? 0,
      defense: defense[team] ?? 0,
      matches: appearances[team] ?? 0,
      weight: weightSum[team] ?? 0,
    });
  }

  return {
    teams,
    homeAdvantage,
    rho,
    asOf: options.asOf,
    sample: usable.length,
    effectiveSample,
    leagueAvgHomeGoals,
    leagueAvgAwayGoals,
    halfLifeDays: config.halfLifeDays,
    ridge: config.ridge,
  };
}

function fitRho(
  matches: ModelMatch[],
  weights: Float64Array,
  index: Map<string, number>,
  attack: Float64Array,
  defense: Float64Array,
  homeAdvantage: number,
): number {
  if (matches.length < 30) return 0;
  let bestRho = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let step = -50; step <= 30; step += 1) {
    const rho = step / 200; // -0.25 .. 0.15
    let score = 0;
    let valid = true;

    for (let position = 0; position < matches.length; position += 1) {
      const match = matches[position]!;
      const home = index.get(match.homeTeamId)!;
      const away = index.get(match.awayTeamId)!;
      const expectedHome = Math.exp(
        (attack[home] ?? 0) + (defense[away] ?? 0) + homeAdvantage,
      );
      const expectedAway = Math.exp(
        (attack[away] ?? 0) + (defense[home] ?? 0),
      );
      const tau = lowScoreTau(
        match.homeGoals,
        match.awayGoals,
        expectedHome,
        expectedAway,
        rho,
      );
      if (!(tau > 0) || !Number.isFinite(tau)) {
        valid = false;
        break;
      }
      score += weights[position]! * Math.log(tau);
    }

    if (valid && score > bestScore) {
      bestScore = score;
      bestRho = rho;
    }
  }

  return bestRho;
}

function lowScoreTau(
  homeGoals: number,
  awayGoals: number,
  expectedHome: number,
  expectedAway: number,
  rho: number,
): number {
  if (homeGoals === 0 && awayGoals === 0) {
    return 1 - expectedHome * expectedAway * rho;
  }
  if (homeGoals === 0 && awayGoals === 1) {
    return 1 + expectedHome * rho;
  }
  if (homeGoals === 1 && awayGoals === 0) {
    return 1 + expectedAway * rho;
  }
  if (homeGoals === 1 && awayGoals === 1) {
    return 1 - rho;
  }
  return 1;
}

function poissonProbability(mean: number, goals: number): number {
  const logFactorial = LOG_FACTORIAL[goals] ?? Number.POSITIVE_INFINITY;
  if (!(mean > 0) || !Number.isFinite(logFactorial)) return 0;
  return Math.exp(-mean + goals * Math.log(mean) - logFactorial);
}

export function scoreMatrix(
  ratings: Ratings,
  homeTeamId: string,
  awayTeamId: string,
  maxGoals = DEFAULT_OPTIONS.maxGoals,
): ScoreMatrix {
  const home = ratings.teams.get(homeTeamId);
  const away = ratings.teams.get(awayTeamId);
  const expectedHome = Math.exp(
    (home?.attack ?? 0) + (away?.defense ?? 0) + ratings.homeAdvantage,
  );
  const expectedAway = Math.exp(
    (away?.attack ?? 0) + (home?.defense ?? 0),
  );

  const probabilities: number[][] = [];
  let total = 0;
  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    const row: number[] = [];
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const base =
        poissonProbability(expectedHome, homeGoals) *
        poissonProbability(expectedAway, awayGoals);
      const tau = lowScoreTau(
        homeGoals,
        awayGoals,
        expectedHome,
        expectedAway,
        ratings.rho,
      );
      const value = base * Math.max(tau, 1e-12);
      row.push(value);
      total += value;
    }
    probabilities.push(row);
  }

  if (total > 0) {
    for (const row of probabilities) {
      for (let column = 0; column < row.length; column += 1) {
        row[column] = (row[column] ?? 0) / total;
      }
    }
  }

  return { probabilities, maxGoals };
}

export function predictMatch(
  ratings: Ratings,
  homeTeamId: string,
  awayTeamId: string,
  maxGoals = DEFAULT_OPTIONS.maxGoals,
): MatchProbabilities {
  const matrix = scoreMatrix(ratings, homeTeamId, awayTeamId, maxGoals);
  let home = 0;
  let draw = 0;
  let away = 0;
  let over25 = 0;
  let btts = 0;
  let expectedHomeGoals = 0;
  let expectedAwayGoals = 0;

  for (let homeGoals = 0; homeGoals <= matrix.maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= matrix.maxGoals; awayGoals += 1) {
      const probability = matrix.probabilities[homeGoals]?.[awayGoals] ?? 0;
      if (homeGoals > awayGoals) home += probability;
      else if (homeGoals === awayGoals) draw += probability;
      else away += probability;

      if (homeGoals + awayGoals >= 3) over25 += probability;
      if (homeGoals > 0 && awayGoals > 0) btts += probability;
      expectedHomeGoals += homeGoals * probability;
      expectedAwayGoals += awayGoals * probability;
    }
  }

  return {
    home,
    draw,
    away,
    over25,
    under25: 1 - over25,
    btts,
    expectedHomeGoals,
    expectedAwayGoals,
  };
}
