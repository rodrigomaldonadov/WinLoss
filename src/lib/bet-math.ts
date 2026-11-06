import Decimal from "decimal.js";
import type { BetStatus } from "@prisma/client";

export type Numeric = Decimal | number | string;

export function toDecimal(value: Numeric): Decimal {
  return new Decimal(value);
}

export function roundMoney(value: Numeric): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export type BetMathInput = {
  stake: Numeric;
  odds: Numeric;
  status: BetStatus;
  isFreeBet?: boolean;
  /** Importe devuelto por la casa en un cashout. */
  cashoutAmount?: Numeric | null;
};

export type BetMathResult = {
  /** Total devuelto (stake incluido, salvo free bets). */
  payout: Decimal;
  /** Beneficio neto; negativo si se pierde. */
  profit: Decimal;
};

/**
 * Calcula payout y beneficio de una apuesta.
 *
 * Regla de free bets: el stake no es dinero real, por lo que no se devuelve
 * ni se descuenta. El beneficio de un free bet ganado es stake * (cuota - 1).
 */export function calculateBetResult(input: BetMathInput): BetMathResult {
  const stake = toDecimal(input.stake);
  const odds = toDecimal(input.odds);
  const isFreeBet = input.isFreeBet ?? false;
  const grossWin = stake.mul(odds.minus(1));

  let payout = new Decimal(0);
  let profit = new Decimal(0);

  switch (input.status) {
    case "WON":
      profit = grossWin;
      payout = isFreeBet ? grossWin : stake.plus(grossWin);
      break;
    case "LOST":
      profit = isFreeBet ? new Decimal(0) : stake.negated();
      payout = new Decimal(0);
      break;
    case "VOID":
      profit = new Decimal(0);
      payout = isFreeBet ? new Decimal(0) : stake;
      break;
    case "HALF_WON":
      profit = grossWin.div(2);
      payout = isFreeBet ? profit : stake.plus(profit);
      break;
    case "HALF_LOST":
      profit = isFreeBet ? new Decimal(0) : stake.div(2).negated();
      payout = isFreeBet ? new Decimal(0) : stake.div(2);
      break;
    case "CASHOUT": {
      const cashout = toDecimal(input.cashoutAmount ?? 0);
      payout = cashout;
      profit = isFreeBet ? cashout : cashout.minus(stake);
      break;
    }
    case "PENDING":
    default:
      payout = new Decimal(0);
      profit = new Decimal(0);
      break;
  }

  return { payout: roundMoney(payout), profit: roundMoney(profit) };
}

export type BetLike = {
  status: BetStatus;
  stake: Numeric;
  odds: Numeric;
  profit?: Numeric | null;
  isFreeBet?: boolean;
  /** Cuota de cierre usada al liquidar. */
  closingOdds?: Numeric | null;
};

export type ClosingLineValue = {
  /** Cuota de cierre con la que se comparó el trade. */
  closingOdds: Decimal;
  /** (Cuota tomada / Cuota de cierre) - 1. */
  value: Decimal;
  /** Closing Line Value en porcentaje: value * 100. */
  percentage: Decimal;
};

/**
 * Closing Line Value (CLV): mide la calidad del trade comparando la cuota a la
 * que se entró con la cuota de cierre (línea de apuesta / líneas del book).
 * CLV positivo = el bettor entró a mejor precio del que cerró la línea.
 * Sin cuota de cierre no se puede calcular; devuelve null.
 */
export function calculateClosingLineValue(
  takenOdds: Numeric,
  closingOdds?: Numeric | null,
): ClosingLineValue | null {
  if (closingOdds === null || closingOdds === undefined) return null;

  const closing = toDecimal(closingOdds);
  if (closing.lte(0)) return null;

  const value = toDecimal(takenOdds).div(closing).minus(1);
  const rounded = roundMoney(value);

  return {
    closingOdds: closing,
    value: rounded,
    percentage: roundMoney(rounded.mul(100)),
  };
}

/**
 * Promedio de CLV sobre las apuestas liquidadas que tengan cuota de cierre.
 * Devuelve null cuando ninguna tiene closing odds.
 */
export function calculateAverageClosingLineValue(
  bets: BetLike[],
): Decimal | null {
  const values = bets
    .map((bet) => calculateClosingLineValue(bet.odds, bet.closingOdds))
    .filter((value): value is ClosingLineValue => value !== null);

  if (values.length === 0) return null;

  const sum = values.reduce(
    (acc, current) => acc.plus(current.percentage),
    new Decimal(0),
  );
  return roundMoney(sum.div(values.length));
}

export type BettingStats = {
  /** Nº de apuestas liquidadas. */
  settledCount: number;
  pendingCount: number;
  wonCount: number;
  lostCount: number;
  /** Suma de stakes reales de apuestas liquidadas. */
  turnover: Decimal;
  /** Capital bloqueado en apuestas pendientes. */
  pendingStake: Decimal;
  profit: Decimal;
  /** Beneficio / bankroll inicial. */
  roi: Decimal;
  /** Beneficio / turnover. */
  yield: Decimal;
  /** (ganadas + medio ganadas) / liquidadas con resultado. */
  winRate: Decimal;
  currentBankroll: Decimal;
};

export function calculateBettingStats(
  bets: BetLike[],
  initialBankroll: Numeric = 0,
): BettingStats {
  let settledCount = 0;
  let pendingCount = 0;
  let wonCount = 0;
  let lostCount = 0;
  let turnover = new Decimal(0);
  let pendingStake = new Decimal(0);
  let profit = new Decimal(0);

  for (const bet of bets) {
    const stake = toDecimal(bet.stake);

    if (bet.status === "PENDING") {
      pendingCount += 1;
      if (!bet.isFreeBet) pendingStake = pendingStake.plus(stake);
      continue;
    }

    settledCount += 1;
    if (!bet.isFreeBet) turnover = turnover.plus(stake);
    profit = profit.plus(toDecimal(bet.profit ?? 0));

    if (bet.status === "WON" || bet.status === "HALF_WON") wonCount += 1;
    if (bet.status === "LOST" || bet.status === "HALF_LOST") lostCount += 1;
  }

  const decided = wonCount + lostCount;
  const initial = toDecimal(initialBankroll);

  return {
    settledCount,
    pendingCount,
    wonCount,
    lostCount,
    turnover: roundMoney(turnover),
    pendingStake: roundMoney(pendingStake),
    profit: roundMoney(profit),
    roi: initial.gt(0) ? profit.div(initial) : new Decimal(0),
    yield: turnover.gt(0) ? profit.div(turnover) : new Decimal(0),
    winRate: decided > 0 ? new Decimal(wonCount).div(decided) : new Decimal(0),
    currentBankroll: roundMoney(initial.plus(profit).minus(pendingStake)),
  };
}
