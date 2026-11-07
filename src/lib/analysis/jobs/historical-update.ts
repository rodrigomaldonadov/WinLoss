export type HistoricalValue = {
  competition: string;
  competitionCode: string | null;
  season: string;
  seasonStart: number;
  playedAt: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  result: string | null;
  odds: unknown;
  stats: unknown;
  dedupeKey?: string | null;
};

export type ExistingHistorical = HistoricalValue & { id: string };

export type HistoricalUpdate = {
  id: string;
  data: {
    competitionCode?: string | null;
    seasonStart?: number;
    homeGoals?: number;
    awayGoals?: number;
    result?: string | null;
    odds?: unknown;
    stats?: unknown;
    dedupeKey?: string | null;
  };
};

function isAnnualSeason(season: string): boolean {
  return /^\d{4}$/.test(season.trim());
}

/**
 * Temporada en curso: las ligas anuales usan el año natural; las de calendario
 * europeo cambian en julio. Se infiere por la etiqueta de temporada, no por el
 * nombre del archivo.
 */
export function currentSeasonStart(season: string, now: Date): number {
  if (isAnnualSeason(season)) return now.getUTCFullYear();
  return now.getUTCMonth() + 1 >= 7
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1;
}

export function isCurrentSeasonRow(
  row: Pick<HistoricalValue, "season" | "seasonStart">,
  now: Date,
): boolean {
  return row.seasonStart === currentSeasonStart(row.season, now);
}

export function historicalKey(
  row: Pick<
    HistoricalValue,
    | "competition"
    | "season"
    | "playedAt"
    | "homeTeamId"
    | "awayTeamId"
  >,
): string {
  return `${row.competition}|${row.season}|${row.playedAt.toISOString()}|${row.homeTeamId}|${row.awayTeamId}`;
}

/** JSON estable para comparar odds/stats sin depender del orden de claves. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Devuelve solo las filas de la temporada en curso que existen y cambiaron.
 * Las temporadas cerradas se dejan intactas. La cuota de cierre que aparece
 * después se detecta porque el objeto `odds` completo cambia.
 */
export function planHistoricalUpdates(
  records: readonly HistoricalValue[],
  existing: readonly ExistingHistorical[],
  now: Date,
): HistoricalUpdate[] {
  const byKey = new Map(
    existing.map((row) => [historicalKey(row), row] as const),
  );
  const updates: HistoricalUpdate[] = [];

  for (const record of records) {
    if (!isCurrentSeasonRow(record, now)) continue;
    const current = byKey.get(historicalKey(record));
    if (!current) continue;

    const data: HistoricalUpdate["data"] = {};
    if (record.competitionCode !== current.competitionCode) {
      data.competitionCode = record.competitionCode;
    }
    if (record.seasonStart !== current.seasonStart) {
      data.seasonStart = record.seasonStart;
    }
    if (record.homeGoals !== current.homeGoals) {
      data.homeGoals = record.homeGoals;
    }
    if (record.awayGoals !== current.awayGoals) {
      data.awayGoals = record.awayGoals;
    }
    if ((record.result ?? null) !== (current.result ?? null)) {
      data.result = record.result ?? null;
    }
    if (stableStringify(record.odds) !== stableStringify(current.odds)) {
      data.odds = record.odds;
    }
    if (stableStringify(record.stats) !== stableStringify(current.stats)) {
      data.stats = record.stats;
    }
    if ((record.dedupeKey ?? null) !== (current.dedupeKey ?? null)) {
      data.dedupeKey = record.dedupeKey ?? null;
    }

    if (Object.keys(data).length > 0) {
      updates.push({ id: current.id, data });
    }
  }

  return updates;
}
