/** Tipos y cuentas de la sección Investigar (ParlayAPI). Sin acceso a red. */

export const PARLAY_PROP_MARKETS = [
  ["player_points", "Puntos"],
  ["player_rebounds", "Rebotes"],
  ["player_assists", "Asistencias"],
  ["player_threes", "Triples"],
] as const;

export type ParlayPropMarket = (typeof PARLAY_PROP_MARKETS)[number][0];

/** Movimiento de una cuota respecto a la captura anterior. */
export type ParlayPriceMove = {
  price: number;
  previous: number | null;
  capturedAt: string;
  previousAt: string | null;
};

export type ParlayMovement = Record<string, ParlayPriceMove>;

export type ParlayOutcome = {
  name: string;
  description?: string;
  price: number;
  point?: number;
};

export type ParlayMarket = {
  key: string;
  last_update?: string;
  outcomes: ParlayOutcome[];
};

export type ParlayBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets: ParlayMarket[];
};

export type ParlayEvent = {
  id: string;
  sport_key: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: ParlayBookmaker[];
};

export type NoVigBook = {
  key: string;
  title: string;
  probabilities: Record<string, number>;
  overround: number;
};

export type ConsensusRow = {
  outcome: string;
  sharp: number | null;
  consensus: number | null;
  cents: number | null;
  bookCount: number;
};

export type BestPrice = {
  outcome: string;
  price: number;
  book: string;
};

export type ArbitrageLeg = {
  label: string;
  price: number;
  book: string;
};

export type ArbitrageCase = {
  market: "h2h" | "totals";
  point: number | null;
  legs: ArbitrageLeg[];
  sum: number;
  profitPct: number;
};

export type PropLine = {
  player: string;
  line: number;
  over: { price: number; book: string } | null;
  under: { price: number; book: string } | null;
};

export function impliedProbability(price: number): number {
  return price > 0 ? 1 / price : 0;
}

/** Probabilidades sin vig de un mercado de 2 o 3 resultados. */
export function noVig(
  outcomes: { name: string; price: number }[],
): { probabilities: Record<string, number>; overround: number } | null {
  const valid = outcomes.filter(
    (outcome) => Number.isFinite(outcome.price) && outcome.price > 1,
  );
  if (valid.length < 2) return null;

  const implied = valid.reduce(
    (total, outcome) => total + impliedProbability(outcome.price),
    0,
  );
  if (implied <= 0) return null;

  const probabilities: Record<string, number> = {};
  for (const outcome of valid) {
    probabilities[outcome.name] = impliedProbability(outcome.price) / implied;
  }
  return { probabilities, overround: implied - 1 };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function centsDifference(
  sharp: number | null,
  consensus: number | null,
): number | null {
  if (sharp === null || consensus === null) return null;
  return (sharp - consensus) * 100;
}

export const SHARP_BOOK_KEYS = new Set(["novig", "prophetx"]);
export const PREDICTION_BOOK_KEYS = new Set(["polymarket", "kalshi"]);

export function findMarket(
  event: ParlayEvent,
  key: string,
): { book: ParlayBookmaker; market: ParlayMarket } | null {
  for (const book of event.bookmakers) {
    const market = book.markets.find((item) => item.key === key);
    if (market) return { book, market };
  }
  return null;
}

/** Probabilidades sin vig por casa para el 1X2 (o 1X2 con empate). */
export function moneylineNoVig(event: ParlayEvent): NoVigBook[] {
  const books: NoVigBook[] = [];
  for (const book of event.bookmakers) {
    const market = book.markets.find((item) => item.key === "h2h");
    if (!market) continue;
    const normalized = noVig(market.outcomes);
    if (!normalized) continue;
    books.push({
      key: book.key,
      title: book.title,
      probabilities: normalized.probabilities,
      overround: normalized.overround,
    });
  }
  return books;
}

export function consensusFor(
  books: NoVigBook[],
  outcomes: string[],
  { includeSharp = false }: { includeSharp?: boolean } = {},
): Record<string, number | null> {
  const pool = includeSharp
    ? books
    : books.filter((book) => !SHARP_BOOK_KEYS.has(book.key));
  const result: Record<string, number | null> = {};
  for (const outcome of outcomes) {
    result[outcome] = median(
      pool
        .map((book) => book.probabilities[outcome])
        .filter((value): value is number => typeof value === "number"),
    );
  }
  return result;
}

export function sharpBook(books: NoVigBook[]): NoVigBook | null {
  return (
    books.find((book) => book.key === "novig") ??
    books.find((book) => book.key === "prophetx") ??
    null
  );
}

export function bestPriceFor(
  event: ParlayEvent,
  marketKey: string,
  outcomeName: string,
  point?: number,
): BestPrice | null {
  let best: BestPrice | null = null;
  for (const book of event.bookmakers) {
    const market = book.markets.find((item) => item.key === marketKey);
    if (!market) continue;
    for (const outcome of market.outcomes) {
      if (outcome.name !== outcomeName) continue;
      if (point !== undefined && outcome.point !== point) continue;
      if (!Number.isFinite(outcome.price) || outcome.price <= 1) continue;
      if (!best || outcome.price > best.price) {
        best = { outcome: outcomeName, price: outcome.price, book: book.title };
      }
    }
  }
  return best;
}

function bestLeg(
  event: ParlayEvent,
  marketKey: string,
  outcomeName: string,
  point?: number,
): ArbitrageLeg | null {
  const best = bestPriceFor(event, marketKey, outcomeName, point);
  return best
    ? { label: outcomeName, price: best.price, book: best.book }
    : null;
}

/** Mejor combinación de cuotas para un mercado; marca arbitraje si < 1. */
export function arbitrageFor(
  event: ParlayEvent,
  marketKey: "h2h" | "totals",
  point: number | null,
): ArbitrageCase | null {
  const legs: ArbitrageLeg[] = [];

  if (marketKey === "h2h") {
    const outcomes = new Set<string>();
    for (const book of event.bookmakers) {
      const market = book.markets.find((item) => item.key === "h2h");
      market?.outcomes.forEach((outcome) => outcomes.add(outcome.name));
    }
    if (outcomes.size < 2) return null;
    for (const name of outcomes) {
      const leg = bestLeg(event, "h2h", name);
      if (!leg) return null;
      legs.push(leg);
    }
  } else {
    const over = bestLeg(event, "totals", "Over", point ?? undefined);
    const under = bestLeg(event, "totals", "Under", point ?? undefined);
    if (!over || !under) return null;
    legs.push(over, under);
  }

  const sum = legs.reduce(
    (total, leg) => total + impliedProbability(leg.price),
    0,
  );
  return {
    market: marketKey,
    point,
    legs,
    sum,
    profitPct: (1 - sum) * 100,
  };
}

export function totalsPoints(event: ParlayEvent): number[] {
  const points = new Set<number>();
  for (const book of event.bookmakers) {
    const market = book.markets.find((item) => item.key === "totals");
    for (const outcome of market?.outcomes ?? []) {
      if (typeof outcome.point === "number") points.add(outcome.point);
    }
  }
  return [...points].sort((left, right) => left - right);
}

/** Mejor over y mejor under por jugador y línea. */
export function propLines(
  event: ParlayEvent,
  marketKey: string,
): PropLine[] {
  const map = new Map<string, PropLine>();

  for (const book of event.bookmakers) {
    const market = book.markets.find((item) => item.key === marketKey);
    if (!market) continue;
    for (const outcome of market.outcomes) {
      if (typeof outcome.point !== "number") continue;
      const player = outcome.description ?? outcome.name;
      const side = /^under/i.test(outcome.name)
        ? "under"
        : /^over/i.test(outcome.name)
          ? "over"
          : null;
      if (!side) continue;
      const key = `${player}|${outcome.point}`;
      const current =
        map.get(key) ??
        { player, line: outcome.point, over: null, under: null };
      const candidate = { price: outcome.price, book: book.title };
      const previous = current[side];
      if (!previous || candidate.price > previous.price) {
        current[side] = candidate;
      }
      map.set(key, current);
    }
  }

  return [...map.values()].sort(
    (left, right) =>
      left.player.localeCompare(right.player) || left.line - right.line,
  );
}

export function bestArbitrage(
  event: ParlayEvent,
  limit = 5,
): ArbitrageCase[] {
  const cases: ArbitrageCase[] = [];
  const h2h = arbitrageFor(event, "h2h", null);
  if (h2h) cases.push(h2h);

  for (const point of totalsPoints(event)) {
    const totals = arbitrageFor(event, "totals", point);
    if (totals) cases.push(totals);
  }

  return cases.sort((left, right) => left.sum - right.sum).slice(0, limit);
}

export function formatCents(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} cents`;
}

export function formatPrice(value: number): string {
  return value.toFixed(2);
}
