import type { BetStatus, BetType } from "@prisma/client";

export const APP_NAME = "WinLoss";
export const APP_DESCRIPTION =
  "Gestiona tu bankroll, registra tus apuestas y mide tu rentabilidad real.";

export const DEFAULT_CURRENCY = "PEN";
export const DEFAULT_TIMEZONE = "America/Lima";

export const CURRENCIES = [
  { code: "PEN", label: "Sol peruano", symbol: "S/" },
  { code: "USD", label: "Dólar estadounidense", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "MXN", label: "Peso mexicano", symbol: "$" },
  { code: "ARS", label: "Peso argentino", symbol: "$" },
  { code: "COP", label: "Peso colombiano", symbol: "$" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const BET_STATUS_LABELS: Record<BetStatus, string> = {
  PENDING: "Pendiente",
  WON: "Ganada",
  LOST: "Perdida",
  VOID: "Anulada",
  HALF_WON: "Media ganada",
  HALF_LOST: "Media perdida",
  CASHOUT: "Cashout",
};

export const BET_STATUS_TONES: Record<
  BetStatus,
  "pending" | "win" | "loss" | "neutral"
> = {
  PENDING: "pending",
  WON: "win",
  HALF_WON: "win",
  LOST: "loss",
  HALF_LOST: "loss",
  VOID: "neutral",
  CASHOUT: "neutral",
};

export const BET_TYPE_LABELS: Record<BetType, string> = {
  SINGLE: "Simple",
  COMBINED: "Combinada",
};

export const SPORTS = [
  "Fútbol",
  "Tenis",
  "Básquet",
  "Béisbol",
  "Vóley",
  "MMA",
  "Boxeo",
  "Fórmula 1",
  "Ciclismo",
  "eSports",
  "Otro",
] as const;

export const MARKETS = [
  "Ganador del partido",
  "Doble oportunidad",
  "Más/Menos goles",
  "Ambos equipos marcan",
  "Hándicap asiático",
  "Primer goleador",
  "Total de sets",
  "Ganador del torneo",
  "Otro",
] as const;

export const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/bets", label: "Apuestas", icon: "tickets" },
  { href: "/bankroll", label: "Bankroll", icon: "wallet" },
  { href: "/settings", label: "Ajustes", icon: "settings" },
] as const;
