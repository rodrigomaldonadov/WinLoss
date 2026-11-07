/**
 * Utilidades de mercado: probabilidad implícita sin margen.
 *
 * La fuente es el promedio de cierre de football-data.co.uk (`AvgC*`). No se
 * da peso extra a Pinnacle (`PSC*`): desde el 23/07/2025 esas cuotas están
 * desactualizadas y el importer no las usa.
 */

export type OneXTwoMarket = {
  home: number;
  draw: number;
  away: number;
  overround: number;
};

export type TotalsMarket = {
  over25: number;
  under25: number;
  overround: number;
};

export type MarketSnapshot = {
  oneXtwo: OneXTwoMarket | null;
  totals: TotalsMarket | null;
};

export type ClosingMarket = MarketSnapshot & {
  pre: MarketSnapshot;
};

function validOdds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 1;
}

/** Normaliza probabilidades implícitas y devuelve null si no son válidas. */
export function removeMargin(values: number[]): number[] | null {
  if (
    values.length === 0 ||
    values.some((value) => !Number.isFinite(value) || value <= 1)
  ) {
    return null;
  }
  const inverse = values.map((value) => 1 / value);
  const total = inverse.reduce((sum, value) => sum + value, 0);
  if (!(total > 0) || !Number.isFinite(total)) return null;
  return inverse.map((value) => value / total);
}

export function market1x2(
  home: unknown,
  draw: unknown,
  away: unknown,
): OneXTwoMarket | null {
  if (!validOdds(home) || !validOdds(draw) || !validOdds(away)) return null;
  const probabilities = removeMargin([home, draw, away]);
  if (!probabilities?.[0] || !probabilities[1] || !probabilities[2]) {
    return null;
  }
  return {
    home: probabilities[0],
    draw: probabilities[1],
    away: probabilities[2],
    overround: 1 / home + 1 / draw + 1 / away - 1,
  };
}

export function marketTotals(
  over25: unknown,
  under25: unknown,
): TotalsMarket | null {
  if (!validOdds(over25) || !validOdds(under25)) return null;
  const probabilities = removeMargin([over25, under25]);
  if (!probabilities?.[0] || !probabilities[1]) return null;
  return {
    over25: probabilities[0],
    under25: probabilities[1],
    overround: 1 / over25 + 1 / under25 - 1,
  };
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function snapshot(value: unknown): MarketSnapshot {
  const recordValue = record(value);
  return {
    oneXtwo: market1x2(
      recordValue?.home,
      recordValue?.draw,
      recordValue?.away,
    ),
    totals: marketTotals(recordValue?.over25, recordValue?.under25),
  };
}

/** Extrae las cuotas pre-cierre y de cierre guardadas en HistoricalMatch.odds. */
export function closingMarketFromRecord(value: unknown): ClosingMarket {
  const odds = record(value);
  const closing = snapshot(odds?.closing);
  return {
    ...closing,
    pre: snapshot(odds?.pre),
  };
}
