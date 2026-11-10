import { zonedDateTimeToUtc } from "@/lib/date";

/** Lunes 00:00 de la semana actual en la zona del usuario, en UTC. */
export function startOfWeekInTimeZone(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const year = value("year");
  const month = value("month");
  const day = value("day");
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = new Date(
    Date.UTC(year, month - 1, day - daysSinceMonday),
  )
    .toISOString()
    .slice(0, 10);

  return zonedDateTimeToUtc(`${monday}T00:00`, timeZone);
}

export function isSelfExclusionActive(
  until: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return Boolean(until && until.getTime() > now.getTime());
}

/** Convierte un stake a PEN para compararlo con el límite semanal. */
export function stakeToPen(
  stake: number,
  currency: string,
  usdToPenRate: number,
): number {
  if (currency === "USD") return stake * usdToPenRate;
  return stake;
}

export function weeklyLimitRemaining(
  limitPen: number | null,
  spentPen: number,
): number | null {
  if (limitPen === null || limitPen <= 0) return null;
  return Math.max(0, limitPen - spentPen);
}
