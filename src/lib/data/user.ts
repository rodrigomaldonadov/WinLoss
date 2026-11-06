import "server-only";

import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export type UserPreferences = {
  currency: string;
  timezone: string;
};

/** Preferencias del usuario (moneda y zona horaria) para formateo de fechas. */
export async function getUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currency: true, timezone: true },
  });

  return {
    currency: user?.currency ?? DEFAULT_CURRENCY,
    timezone: user?.timezone ?? DEFAULT_TIMEZONE,
  };
}
