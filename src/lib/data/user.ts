import "server-only";

import {
  DEFAULT_CURRENCY,
  DEFAULT_DEBT_ALERT_THRESHOLD,
  DEFAULT_TIMEZONE,
  DEFAULT_USD_TO_PEN_RATE,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export type UserPreferences = {
  currency: string;
  timezone: string;
  usdToPenRate: number;
  debtAlertThresholdPct: number;
  showDebts: boolean;
};

/** Preferencias del usuario (moneda, zona horaria y deudas). */
export async function getUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      currency: true,
      timezone: true,
      usdToPenRate: true,
      debtAlertThresholdPct: true,
      showDebts: true,
    },
  });

  return {
    currency: user?.currency ?? DEFAULT_CURRENCY,
    timezone: user?.timezone ?? DEFAULT_TIMEZONE,
    usdToPenRate: user?.usdToPenRate
      ? Number(user.usdToPenRate)
      : DEFAULT_USD_TO_PEN_RATE,
    debtAlertThresholdPct:
      user?.debtAlertThresholdPct !== null &&
      user?.debtAlertThresholdPct !== undefined
        ? Number(user.debtAlertThresholdPct)
        : DEFAULT_DEBT_ALERT_THRESHOLD,
    showDebts: user?.showDebts ?? true,
  };
}
