import {
  canonicalTeamKey,
  splitEventName,
} from "@/lib/analysis/community";
import {
  normalizeTeamName,
  type TeamAliasesFile,
} from "@/lib/analysis/team-names";

/**
 * Piezas puras del buscador de historial: estado de filtros en la URL, rangos
 * rápidos y vínculo entre un partido jugado y los picks del usuario.
 *
 * No accede a base de datos ni a `next/*`, para poder probarlo en Vitest.
 */

export const HISTORY_PAGE_SIZE = 20;

export const HISTORY_MODES = ["all", "saved", "reconstructed"] as const;
export type HistoryMode = (typeof HISTORY_MODES)[number];

export const HISTORY_MODE_LABELS: Record<HistoryMode, string> = {
  all: "Todas",
  saved: "Guardada",
  reconstructed: "Reconstruida",
};

export type HistoryFilterState = {
  query: string;
  competitions: string[];
  /** Día local `YYYY-MM-DD` inclusive. */
  from: string | null;
  /** Día local `YYYY-MM-DD` inclusive. */
  to: string | null;
  mode: HistoryMode;
  mine: boolean;
  page: number;
};

export const EMPTY_HISTORY_FILTERS: HistoryFilterState = {
  query: "",
  competitions: [],
  from: null,
  to: null,
  mode: "all",
  mine: false,
  page: 1,
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QUERY_LENGTH = 80;
const MAX_COMPETITIONS = 20;

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `YYYY-MM-DD` válido y existente (rechaza 2026-02-31). */
export function isValidDateKey(value: string | null | undefined): boolean {
  if (!value || !DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return date.toISOString().slice(0, 10) === value;
}

function parseDateKey(value?: string | string[]): string | null {
  const raw = firstParam(value)?.trim();
  return raw && isValidDateKey(raw) ? raw : null;
}

function parsePage(value?: string | string[]): number {
  const parsed = Number.parseInt(firstParam(value) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseQuery(value?: string | string[]): string {
  return (firstParam(value) ?? "").trim().slice(0, MAX_QUERY_LENGTH);
}

function parseCompetitions(value?: string | string[]): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  for (const item of raw) {
    const name = item.trim().slice(0, MAX_QUERY_LENGTH);
    if (name) seen.add(name);
  }
  return [...seen].slice(0, MAX_COMPETITIONS);
}

export function parseHistoryFilters(
  params: Record<string, string | string[] | undefined>,
): HistoryFilterState {
  const modeRaw = firstParam(params.modo);
  const mode: HistoryMode =
    modeRaw === "saved" || modeRaw === "reconstructed" ? modeRaw : "all";

  let from = parseDateKey(params.desde);
  let to = parseDateKey(params.hasta);
  if (from && to && from > to) [from, to] = [to, from];

  return {
    query: parseQuery(params.q),
    competitions: parseCompetitions(params.competicion),
    from,
    to,
    mode,
    mine: firstParam(params.mios) === "1",
    page: parsePage(params.pagina),
  };
}

/** URL canónica del historial. Los valores por defecto no se escriben. */
export function historyHref(state: HistoryFilterState): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  for (const competition of state.competitions) {
    params.append("competicion", competition);
  }
  if (state.from) params.set("desde", state.from);
  if (state.to) params.set("hasta", state.to);
  if (state.mode !== "all") params.set("modo", state.mode);
  if (state.mine) params.set("mios", "1");
  if (state.page > 1) params.set("pagina", String(state.page));

  const query = params.toString();
  return query ? `/analysis/historial?${query}` : "/analysis/historial";
}

/** Día `YYYY-MM-DD` en la zona del usuario. */
export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDaysToDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

export type HistoryPreset = "week" | "month";

export const HISTORY_PRESET_DAYS: Record<HistoryPreset, number> = {
  week: 7,
  month: 30,
};

/** Ventana inclusiva de los últimos 7/30 días, en la zona del usuario. */
export function historyPresetRange(
  preset: HistoryPreset,
  now: Date,
  timeZone: string,
): { from: string; to: string } {
  const to = dateKeyInTimeZone(now, timeZone);
  return { from: addDaysToDateKey(to, -(HISTORY_PRESET_DAYS[preset] - 1)), to };
}

export function isHistoryPresetActive(
  state: HistoryFilterState,
  preset: HistoryPreset,
  now: Date,
  timeZone: string,
): boolean {
  const range = historyPresetRange(preset, now, timeZone);
  return state.from === range.from && state.to === range.to;
}

export type HistoryPresets = Record<
  HistoryPreset,
  { from: string; to: string; href: string; active: boolean }
>;

export function historyPresets(
  state: HistoryFilterState,
  now: Date,
  timeZone: string,
): HistoryPresets {
  const build = (preset: HistoryPreset) => {
    const range = historyPresetRange(preset, now, timeZone);
    return {
      ...range,
      href: historyHref({ ...state, ...range, page: 1 }),
      active: isHistoryPresetActive(state, preset, now, timeZone),
    };
  };
  return { week: build("week"), month: build("month") };
}

/**
 * Clave de captura usada por `AnalysisSnapshot`. Debe coincidir con
 * `getMatchReview`: nombres canónicos normalizados + fecha UTC del partido.
 */
export function historyMatchKey({
  homeName,
  awayName,
  playedAt,
}: {
  homeName: string;
  awayName: string;
  playedAt: Date;
}): string {
  return `${normalizeTeamName(homeName)}|${normalizeTeamName(awayName)}|${playedAt
    .toISOString()
    .slice(0, 10)}`;
}

const MINE_TIME_TOLERANCE_MS = 36 * 60 * 60 * 1000;

export type HistoryLeg = {
  eventName: string;
  eventDate: Date | null;
};

function pairKey(homeKey: string, awayKey: string): string {
  return [homeKey, awayKey].sort().join("|");
}

/**
 * Índice de picks del usuario: par de equipos (sin importar el orden) →
 * instantes de sus apuestas. Evita comparar cada partido contra todos los legs.
 */
export function buildMineIndex(
  legs: readonly HistoryLeg[],
  aliases: TeamAliasesFile,
): Map<string, number[]> {
  const index = new Map<string, number[]>();

  for (const leg of legs) {
    if (!leg.eventDate) continue;
    const parts = splitEventName(leg.eventName);
    if (!parts) continue;

    const first = canonicalTeamKey(parts[0], aliases);
    const second = canonicalTeamKey(parts[1], aliases);
    if (!first || !second) continue;

    const key = pairKey(first, second);
    const times = index.get(key) ?? [];
    times.push(leg.eventDate.getTime());
    index.set(key, times);
  }

  return index;
}

export function matchIsMine(
  index: Map<string, number[]>,
  {
    homeName,
    awayName,
    playedAt,
  }: { homeName: string; awayName: string; playedAt: Date },
  aliases: TeamAliasesFile,
): boolean {
  if (index.size === 0) return false;

  const home = canonicalTeamKey(homeName, aliases);
  const away = canonicalTeamKey(awayName, aliases);
  if (!home || !away) return false;

  const times = index.get(pairKey(home, away));
  if (!times) return false;

  return times.some(
    (time) => Math.abs(time - playedAt.getTime()) <= MINE_TIME_TOLERANCE_MS,
  );
}
