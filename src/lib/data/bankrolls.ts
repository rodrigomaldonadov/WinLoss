import "server-only";

import { toBetListItem } from "./bets";

import { calculateBettingStats } from "@/lib/bet-math";
import { prisma } from "@/lib/prisma";
import type { BankrollSummary } from "@/lib/types";

export async function getBankrollsForUser(
  userId: string,
): Promise<BankrollSummary[]> {
  const bankrolls = await prisma.bankroll.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: {
      bets: {
        orderBy: [{ placedAt: "desc" }, { createdAt: "desc" }],
        include: {
          bookmaker: { select: { id: true, name: true } },
          legs: {
            orderBy: { position: "asc" },
            include: {
              selections: { orderBy: { position: "asc" } },
            },
          },
        },
      },
    },
  });

  return bankrolls.map((bankroll) => {
    const stats = calculateBettingStats(bankroll.bets, bankroll.initialAmount);

    const betListItems = bankroll.bets.map((bet) =>
      toBetListItem({
        ...bet,
        bankroll: {
          id: bankroll.id,
          name: bankroll.name,
          currency: bankroll.currency,
        },
      }),
    );

    return {
      id: bankroll.id,
      name: bankroll.name,
      currency: bankroll.currency,
      initialAmount: Number(bankroll.initialAmount),
      isActive: bankroll.isActive,
      currentBankroll: stats.currentBankroll.toNumber(),
      profit: stats.profit.toNumber(),
      turnover: stats.turnover.toNumber(),
      pendingStake: stats.pendingStake.toNumber(),
      pendingCount: stats.pendingCount,
      settledCount: stats.settledCount,
      winRate: stats.winRate.toNumber(),
      roi: stats.roi.toNumber(),
      yield: stats.yield.toNumber(),
      bets: betListItems,
    };
  });
}

export async function getUserBankrollOptions(userId: string) {
  return prisma.bankroll.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true, currency: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function countUserBankrolls(userId: string): Promise<number> {
  return prisma.bankroll.count({ where: { userId } });
}

export async function getBankrollHistory(
  userId: string,
  take = 180
): Promise<{ date: string; bankroll: number }[]> {
  const bets = await prisma.bet.findMany({
    where: { userId },
    orderBy: [{ placedAt: "asc" }, { createdAt: "asc" }],
    take,
    select: {
      placedAt: true,
      stake: true,
      profit: true,
      isFreeBet: true,
    },
  });

  // Acumular bankroll día a día partiendo del saldo inicial de cada bankroll activo
  const bankrolls = await prisma.bankroll.findMany({
    where: { userId, isActive: true },
    select: {
      initialAmount: true,
      bets: {
        select: {
          status: true,
          stake: true,
          odds: true,
          profit: true,
          isFreeBet: true,
        },
      },
    },
  });

  // Por simplicidad, usamos el bankroll principal y calculamos el patrimonio
  // día a día sumando stakes y profits reales.
  // En producción esto sería una tabla de movimientos.
  const initialBankroll = bankrolls[0]?.initialAmount?.toNumber() ?? 0;

  const dailyBankrolls = bets.reduce<
    Map<string, { profit: number; stake: number }>
  >((acc, bet) => {
    const day = bet.placedAt
      ? `${bet.placedAt.getFullYear()}-${String(bet.placedAt.getMonth() + 1).padStart(2, "0")}-${String(bet.placedAt.getDate()).padStart(2, "0")}`
      : "unknown";
    if (!acc.has(day)) acc.set(day, { profit: 0, stake: 0 });
    const dayData = acc.get(day)!;
    if (bet.isFreeBet) {
      dayData.profit += 0; // free bets no afectan profit real
    } else {
      dayData.profit += Number(bet.profit ?? 0);
    }
    dayData.stake += Number(bet.stake ?? 0);
    acc.set(day, dayData);
    return acc;
  }, new Map());

  const result: { date: string; bankroll: number }[] = [];
  let runningBankroll = Number(initialBankroll);

  const sortedDays = Array.from(dailyBankrolls.keys()).sort();
  for (const day of sortedDays) {
    const { profit } = dailyBankrolls.get(day)!;
    // Para el gráfico mostramos: inicial + profit acumulado (sin descuentar stake pendiente aún)
    runningBankroll = Number(initialBankroll) + profit;
    result.push({ date: day, bankroll: Math.max(0, runningBankroll) });
  }

  return result;
}

export async function calculateDrawdown(
  userId: string,
  bankrollId?: string
): Promise<{
  currentBankroll: number;
  initialBankroll: number;
  drawdown: number;
  thresholdExceeded: boolean;
  label: string;
}> {
  // Obtener bankrolls activos usando la función ya probada
  const bankrolls = await getBankrollsForUser(userId);

  if (bankrolls.length === 0) {
    return {
      currentBankroll: 0,
      initialBankroll: 0,
      drawdown: 0,
      thresholdExceeded: false,
      label: "Sin bankrolls activos",
    };
  }

  // Usar el bankroll especificado o el primero
  const targetBankroll = bankrollId
    ? bankrolls.find((b) => b.id === bankrollId)
    : bankrolls[0];

  if (!targetBankroll) {
    return {
      currentBankroll: 0,
      initialBankroll: 0,
      drawdown: 0,
      thresholdExceeded: false,
      label: "Sin bankrolls activos",
    };
  }

  const initialBankroll = targetBankroll.initialAmount;
  // currentBankroll ya viene calculado en BankrollSummary.currentBankroll
  const currentBankroll = targetBankroll.currentBankroll;

  // 3. Drawdown respecto al saldo inicial
  // drawdown = (initial - current) / initial
  const drawdown = initialBankroll > 0 ? (initialBankroll - currentBankroll) / initialBankroll : 0;

  const thresholdExceeded = drawdown >= 0.15;

  const label =
    thresholdExceeded
      ? "⚠️ Drawdown alto: tu bankroll ha caído un 15% o más de tu inicio."
      : drawdown > 0
        ? `-${((drawdown) * 100).toFixed(1)}% de drawdown`
        : "Bankroll estable";

  return {
    currentBankroll,
    initialBankroll,
    drawdown,
    thresholdExceeded,
    label,
  };
}