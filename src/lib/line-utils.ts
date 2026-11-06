export const GOAL_LINE_PRESETS = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5] as const;
export const CORNER_LINE_PRESETS = [
  7.5, 8.5, 9.5, 10.5, 11.5, 12.5,
] as const;
export const CARD_LINE_PRESETS = [2.5, 3.5, 4.5, 5.5, 6.5] as const;

export const DEFAULT_LINE = {
  goals: 2.5,
  corners: 9.5,
  cards: 3.5,
} as const;

export function roundToQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

export function clampLine(
  value: number,
  { min = 0.25, max = 30 }: { min?: number; max?: number } = {},
): number {
  return Math.min(max, Math.max(min, value));
}

/** Normaliza una línea escrita ("2,75" → 2.75) y la ajusta a cuartos. */
export function normalizeLine(
  input: string | number,
  bounds?: { min?: number; max?: number },
): number | null {
  const text = typeof input === "string" ? input.trim() : input;
  if (text === "") return null;
  const raw =
    typeof text === "number" ? text : Number(text.replace(",", "."));
  if (!Number.isFinite(raw)) return null;
  return clampLine(roundToQuarter(raw), bounds);
}

export function stepLine(
  value: number,
  delta = 0.5,
  bounds?: { min?: number; max?: number },
): number {
  return clampLine(roundToQuarter(value + delta), bounds);
}

/** Línea de cuarto (x.25 / x.75). */
export function isQuarterLine(value: number): boolean {
  return Math.abs((value * 4) % 2) === 1;
}

/** Muestra 2.5 y 2.25 sin ceros sobrantes. */
export function formatLine(value: number): string {
  return Number.isInteger(value * 100)
    ? String(value)
    : value.toFixed(2).replace(/0$/, "");
}
