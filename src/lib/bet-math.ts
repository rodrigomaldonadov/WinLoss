import Decimal from "decimal.js";
import type { BetStatus, LegStatus } from "@prisma/client";

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

// ---------------------------------------------------------------------------
// Motor de legs (Simple / Múltiple / Bet Builder)
// ---------------------------------------------------------------------------

export type LegMathInput = {
  odds: Numeric;
  status: LegStatus;
};

/** Cuota efectiva de un leg según su resultado. PENDING no se puede resolver. */
export function effectiveLegOdds(
  odds: Numeric,
  status: LegStatus,
): Decimal | null {
  switch (status) {
    case "WON":
      return toDecimal(odds);
    case "VOID":
      return new Decimal(1);
    case "HALF_WON":
      return toDecimal(odds).plus(1).div(2);
    case "HALF_LOST":
      return new Decimal("0.5");
    case "LOST":
      return new Decimal(0);
    case "PENDING":
    default:
      return null;
  }
}

/** Producto de cuotas de legs con 3 decimales de precisión. */
export function totalOdds(legs: { odds: Numeric }[]): Decimal {
  const product = legs.reduce(
    (acc, leg) => acc.mul(toDecimal(leg.odds)),
    new Decimal(1),
  );
  return product.toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

export type SettleBetResult = {
  status: Exclude<BetStatus, "CASHOUT" | "PENDING"> | "PENDING";
  /** Cuota efectiva combinada (producto de cuotas efectivas por leg). */
  effectiveOdds: Decimal;
  /** Total devuelto (stake incluido, salvo free bets). */
  payout: Decimal;
  /** Beneficio neto; negativo si se pierde. */
  profit: Decimal;
};

/**
 * Liquida un boleto a partir del estado de sus legs.
 *
 * Reglas:
 * - Cualquier leg LOST pierde el boleto completo, aunque haya pendientes.
 * - Si no hay LOST y queda algún PENDING, el boleto sigue PENDING.
 * - Todos VOID -> VOID.
 * - Con legs HALF_*: eff > 1 -> HALF_WON, eff < 1 -> HALF_LOST, eff = 1 -> VOID.
 * - Sin halves -> WON.
 * - Free bet: el stake no se devuelve; el beneficio ganado es stake * (eff - 1).
 */
export function settleBet(
  legs: LegMathInput[],
  stake: Numeric,
  isFreeBet = false,
): SettleBetResult {
  const stakeValue = toDecimal(stake);

  if (legs.length === 0) {
    return {
      status: "PENDING",
      effectiveOdds: new Decimal(0),
      payout: new Decimal(0),
      profit: new Decimal(0),
    };
  }

  if (legs.some((leg) => leg.status === "LOST")) {
    return {
      status: "LOST",
      effectiveOdds: new Decimal(0),
      payout: new Decimal(0),
      profit: isFreeBet ? new Decimal(0) : roundMoney(stakeValue.negated()),
    };
  }

  if (legs.some((leg) => leg.status === "PENDING")) {
    return {
      status: "PENDING",
      effectiveOdds: new Decimal(0),
      payout: new Decimal(0),
      profit: new Decimal(0),
    };
  }

  const allVoid = legs.every((leg) => leg.status === "VOID");
  const hasHalves = legs.some(
    (leg) => leg.status === "HALF_WON" || leg.status === "HALF_LOST",
  );

  const effectiveOdds = legs.reduce((acc, leg) => {
    const legOdds = effectiveLegOdds(leg.odds, leg.status);
    return acc.mul(legOdds ?? 0);
  }, new Decimal(1));

  let status: SettleBetResult["status"];
  if (allVoid) {
    status = "VOID";
  } else if (hasHalves) {
    status = effectiveOdds.gt(1)
      ? "HALF_WON"
      : effectiveOdds.lt(1)
        ? "HALF_LOST"
        : "VOID";
  } else {
    status = "WON";
  }

  const grossPayout = stakeValue.mul(effectiveOdds);
  const grossProfit = grossPayout.minus(stakeValue);

  let payout = grossPayout;
  let profit = grossProfit;

  if (isFreeBet) {
    if (status === "VOID" || effectiveOdds.lt(1)) {
      payout = new Decimal(0);
      profit = new Decimal(0);
    } else {
      payout = grossProfit;
      profit = grossProfit;
    }
  }

  return {
    status,
    effectiveOdds: effectiveOdds.toDecimalPlaces(3, Decimal.ROUND_HALF_UP),
    payout: roundMoney(payout),
    profit: roundMoney(profit),
  };
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
  // 4 decimales bastan para mostrar 8,1 % sin perder precisión.
  const rounded = value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    closingOdds: closing,
    value: rounded,
    percentage: rounded.mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  };
}

export type LegWithClosingOdds = {
  odds: Numeric;
  closingOdds?: Numeric | null;
};

/**
 * CLV de un boleto: producto de los CLV (ratio tomada/cierre) de sus legs.
 * Los legs sin closingOdds se omiten del cálculo.
 */
export function calculateBetClosingLineValue(
  legs: LegWithClosingOdds[],
): ClosingLineValue | null {
  const legsWithClosing = legs.filter(
    (leg) => leg.closingOdds !== null && leg.closingOdds !== undefined,
  );

  if (legsWithClosing.length === 0) return null;

  let combinedRatio = new Decimal(1);
  let combinedClosingOdds = new Decimal(1);

  for (const leg of legsWithClosing) {
    const closing = toDecimal(leg.closingOdds as Numeric);
    if (closing.lte(0)) continue;
    combinedRatio = combinedRatio.mul(toDecimal(leg.odds).div(closing));
    combinedClosingOdds = combinedClosingOdds.mul(closing);
  }

  const value = combinedRatio.minus(1).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    closingOdds: combinedClosingOdds.toDecimalPlaces(3, Decimal.ROUND_HALF_UP),
    value,
    percentage: value.mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  };
}

export type ClosingLineValueSource = {
  legs?: LegWithClosingOdds[];
  odds?: Numeric;
  closingOdds?: Numeric | null;
};

/**
 * Promedio de CLV sobre los boletos que tengan al menos un leg con cuota de
 * cierre. Devuelve una fracción (0.081 → 8,1 % con `formatPercent`) o null.
 */
export function calculateAverageClosingLineValue(
  bets: ClosingLineValueSource[],
): Decimal | null {
  const values = bets
    .map((bet) => {
      if (bet.legs && bet.legs.length > 0) {
        return calculateBetClosingLineValue(bet.legs);
      }
      if (bet.odds === undefined) return null;
      return calculateClosingLineValue(bet.odds, bet.closingOdds);
    })
    .filter((value): value is ClosingLineValue => value !== null);

  if (values.length === 0) return null;

  const sum = values.reduce(
    (acc, current) => acc.plus(current.value),
    new Decimal(0),
  );
  return sum.div(values.length).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
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
