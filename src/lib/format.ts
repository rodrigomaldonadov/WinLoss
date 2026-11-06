import type { Numeric } from "@/lib/bet-math";

const LOCALE = "es-PE";

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string) {
  const cached = currencyFormatters.get(currency);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  currencyFormatters.set(currency, formatter);
  return formatter;
}

export function formatCurrency(value: Numeric, currency = "PEN"): string {
  return getCurrencyFormatter(currency).format(Number(value));
}

/** La cuota siempre con 2 decimales: 1,85. */
export function formatOdds(value: Numeric): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatPercent(
  value: Numeric,
  { decimals = 1, signed = false }: { decimals?: number; signed?: boolean } = {},
): string {
  const number = Number(value);
  const formatted = new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(number);

  return formatted;
}

export function formatSignedCurrency(
  value: Numeric,
  currency = "PEN",
): string {
  const number = Number(value);
  const prefix = number > 0 ? "+" : "";
  return `${prefix}${formatCurrency(number, currency)}`;
}

export function getInitials(
  name?: string | null,
  email?: string | null,
): string {
  const source = name?.trim() || email?.split("@")[0] || "U";
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function formatDate(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" },
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(LOCALE, options).format(date);
}

export function formatDateTime(
  value: Date | string,
  timeZone?: string,
): string {
  return formatDate(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}
