/**
 * Normalización compartida de nombres de equipos.
 *
 * No crea alias automáticamente: el importer solo resuelve nombres que ya
 * existen en `team-aliases.json`. Las coincidencias difusas se usan únicamente
 * como sugerencias en `npm run analysis:aliases`.
 */

const CLUB_TOKENS = new Set([
  "fc",
  "cf",
  "afc",
  "sc",
  "ac",
  "as",
  "ss",
  "ssc",
  "cd",
  "ud",
  "sv",
  "vfb",
  "fk",
  "sk",
  "bk",
  "kf",
  "nk",
  "hnk",
  "if",
  "ff",
  "fsv",
  "bsc",
  "fcm",
]);

export function normalizeTeamName(value: string): string {
  const tokens = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !CLUB_TOKENS.has(token));

  // Quita el número de división que precede a algunos nombres ("1. FC Köln").
  if (tokens.length > 1 && /^\d{1,2}$/.test(tokens[0] ?? "")) {
    tokens.shift();
  }

  return tokens.join(" ");
}

export type TeamAliasesFile = {
  version: number;
  description?: string;
  teams: Record<string, string>;
};

export function isTeamAliasesFile(value: unknown): value is TeamAliasesFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { teams?: unknown };
  return Boolean(
    candidate.teams &&
      typeof candidate.teams === "object" &&
      !Array.isArray(candidate.teams),
  );
}

/** Distancia de Levenshtein para sugerencias, nunca para resolver. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + 1,
        diagonal + cost,
      );
      diagonal = temp;
    }
  }
  return previous[b.length] ?? 0;
}

/** Devuelve los alias canónicos más parecidos, sin usarlos automáticamente. */
export function suggestTeamAliases(
  rawName: string,
  knownKeys: string[],
  limit = 3,
): string[] {
  const normalized = normalizeTeamName(rawName);
  if (!normalized) return [];

  return [...knownKeys]
    .map((key) => ({
      key,
      distance: levenshtein(normalized, key),
    }))
    .filter((item) => item.distance <= Math.max(3, normalized.length * 0.35))
    .sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map((item) => item.key);
}
