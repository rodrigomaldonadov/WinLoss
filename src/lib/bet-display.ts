import type { BetType, LegStatus } from "@prisma/client";

export function getBetTypeLabel(bet: {
  betType: BetType;
  legs: { isBuilder: boolean }[];
}): string {
  if (bet.legs.length > 1) return `Múltiple (${bet.legs.length})`;
  if (bet.legs[0]?.isBuilder) return "Builder";
  if (bet.betType === "COMBINED") return "Múltiple";
  return "Simple";
}

export const LEG_STATUS_LABELS: Record<LegStatus, string> = {
  PENDING: "Pendiente",
  WON: "Ganada",
  LOST: "Perdida",
  VOID: "Anulada",
  HALF_WON: "Media ganada",
  HALF_LOST: "Media perdida",
};

export const LEG_STATUS_TONE: Record<
  LegStatus,
  "pending" | "win" | "loss" | "neutral"
> = {
  PENDING: "pending",
  WON: "win",
  HALF_WON: "win",
  LOST: "loss",
  HALF_LOST: "loss",
  VOID: "neutral",
};
