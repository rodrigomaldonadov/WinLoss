import "server-only";

import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const EXCHANGE_RATE_KINDS = ["BUY", "SELL"] as const;
export type ExchangeRateKind = (typeof EXCHANGE_RATE_KINDS)[number];

export const EXCHANGE_RATE_KIND_LABELS: Record<ExchangeRateKind, string> = {
  BUY: "Compra",
  SELL: "Venta",
};

export type ExchangeRateItem = {
  id: string;
  label: string;
  buyRate: number;
  sellRate: number;
  effectiveAt: Date;
  note: string | null;
  createdAt: Date;
};

function toItem(row: {
  id: string;
  label: string;
  buyRate: unknown;
  sellRate: unknown;
  effectiveAt: Date;
  note: string | null;
  createdAt: Date;
}): ExchangeRateItem {
  return {
    id: row.id,
    label: row.label,
    buyRate: Number(row.buyRate),
    sellRate: Number(row.sellRate),
    effectiveAt: row.effectiveAt,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/** Historial de tasas del usuario, de la más reciente a la más antigua. */
export async function getExchangeRates(
  userId: string,
  client: PrismaClient = prisma,
): Promise<ExchangeRateItem[]> {
  const rows = await client.exchangeRate.findMany({
    where: { userId },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toItem);
}

export async function getLatestExchangeRate(
  userId: string,
  client: PrismaClient = prisma,
): Promise<ExchangeRateItem | null> {
  const row = await client.exchangeRate.findFirst({
    where: { userId },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
  });
  return row ? toItem(row) : null;
}

/** Valor de la tasa para un lado concreto (compra o venta). */
export function rateValue(
  entry: Pick<ExchangeRateItem, "buyRate" | "sellRate">,
  kind: ExchangeRateKind,
): number {
  return kind === "BUY" ? entry.buyRate : entry.sellRate;
}
