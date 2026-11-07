import type { CsvTable } from "./csv";
import {
  cell,
  columnIndex,
  parseCsv,
  parseCsvDate,
  parseCsvDateTime,
  parseDecimal,
  parseInteger,
  parseSeasonStart,
  seasonLabel,
} from "./csv";
import { normalizeTeamName, type TeamAliasesFile } from "./team-names";

export const ANALYSIS_MIN_SEASON_START = new Date(
  Date.UTC(2022, 6, 1, 0, 0, 0),
);

export const HISTORICAL_SOURCE = "football-data.co.uk";
export const FIXTURE_SOURCE = "football-data.co.uk:fixtures";
export const FIXTURE_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;

export type CompetitionInfo = {
  competition: string;
  code: string;
  country: string;
  target: boolean;
};

const MAIN_COMPETITIONS: Record<string, CompetitionInfo> = {
  E0: { competition: "Premier League", code: "E0", country: "Inglaterra", target: true },
  E1: { competition: "Championship", code: "E1", country: "Inglaterra", target: false },
  E2: { competition: "League One", code: "E2", country: "Inglaterra", target: false },
  E3: { competition: "League Two", code: "E3", country: "Inglaterra", target: false },
  EC: { competition: "National League", code: "EC", country: "Inglaterra", target: false },
  SP1: { competition: "LaLiga", code: "SP1", country: "España", target: true },
  SP2: { competition: "LaLiga 2", code: "SP2", country: "España", target: false },
  I1: { competition: "Serie A", code: "I1", country: "Italia", target: true },
  I2: { competition: "Serie B", code: "I2", country: "Italia", target: false },
  D1: { competition: "Bundesliga", code: "D1", country: "Alemania", target: true },
  D2: { competition: "2. Bundesliga", code: "D2", country: "Alemania", target: false },
  F1: { competition: "Ligue 1", code: "F1", country: "Francia", target: true },
  F2: { competition: "Ligue 2", code: "F2", country: "Francia", target: false },
  B1: { competition: "Pro League", code: "B1", country: "Bélgica", target: false },
  N1: { competition: "Eredivisie", code: "N1", country: "Países Bajos", target: false },
  P1: { competition: "Primeira Liga", code: "P1", country: "Portugal", target: false },
  T1: { competition: "Süper Lig", code: "T1", country: "Turquía", target: false },
  G1: { competition: "Super League", code: "G1", country: "Grecia", target: false },
  SC0: { competition: "Premiership", code: "SC0", country: "Escocia", target: false },
  SC1: { competition: "Championship", code: "SC1", country: "Escocia", target: false },
  SC2: { competition: "League One", code: "SC2", country: "Escocia", target: false },
  SC3: { competition: "League Two", code: "SC3", country: "Escocia", target: false },
};

const EXTRA_COMPETITIONS: Record<string, CompetitionInfo> = {
  ARG: { competition: "Liga Profesional", code: "ARG", country: "Argentina", target: true },
  BRA: { competition: "Brasileirão Serie A", code: "BRA", country: "Brasil", target: true },
  AUT: { competition: "Bundesliga (Austria)", code: "AUT", country: "Austria", target: false },
  DNK: { competition: "Superliga (Dinamarca)", code: "DNK", country: "Dinamarca", target: false },
  FIN: { competition: "Veikkausliiga", code: "FIN", country: "Finlandia", target: false },
  IRL: { competition: "Premier Division (Irlanda)", code: "IRL", country: "Irlanda", target: false },
  MEX: { competition: "Liga MX", code: "MEX", country: "México", target: false },
  NOR: { competition: "Eliteserien", code: "NOR", country: "Noruega", target: false },
  POL: { competition: "Ekstraklasa", code: "POL", country: "Polonia", target: false },
  ROU: { competition: "Liga I", code: "ROU", country: "Rumanía", target: false },
  SWE: { competition: "Allsvenskan", code: "SWE", country: "Suecia", target: false },
  SWZ: { competition: "Super League (Suiza)", code: "SWZ", country: "Suiza", target: false },
  USA: { competition: "MLS", code: "USA", country: "EE. UU.", target: false },
};

export function competitionForCode(
  code: string,
  extra: boolean,
  fallbackCountry = "",
  fallbackLeague = "",
): CompetitionInfo {
  const found = extra
    ? EXTRA_COMPETITIONS[code]
    : MAIN_COMPETITIONS[code];
  if (found) return found;
  return {
    competition: fallbackLeague
      ? `${fallbackCountry} · ${fallbackLeague}`
      : fallbackLeague || code,
    code,
    country: fallbackCountry,
    target: false,
  };
}

export type HistoricalRow = {
  competition: CompetitionInfo;
  season: string;
  seasonStart: number;
  playedAt: Date;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  result: string;
  odds: Record<string, unknown> | null;
  stats: Record<string, unknown> | null;
  sourceFile: string;
  rowNumber: number;
};

export type FixtureRow = {
  competition: CompetitionInfo;
  kickoff: Date;
  homeName: string;
  awayName: string;
  odds: Record<string, unknown> | null;
  sourceKey: string;
  sourceFile: string;
  rowNumber: number;
};

export type ParsedFile = {
  format: "historical" | "fixtures" | "unsupported";
  rows: HistoricalRow[];
  fixtures: FixtureRow[];
  warnings: string[];
  skippedOld: number;
  skippedInvalid: number;
  skippedMissingScore: number;
  duplicatesInFile: number;
  encoding: string;
  delimiter: string;
};

function isExtraTable(table: CsvTable): boolean {
  return (
    table.headers.includes("Country") &&
    table.headers.includes("League") &&
    table.headers.includes("Season")
  );
}

export function isFixturePath(sourceFile: string): boolean {
  return /(^|\/)fixtures?\//i.test(sourceFile.replace(/\\/g, "/"));
}

function isFixtureTable(table: CsvTable): boolean {
  const hasTeams =
    columnIndex(table.headers, "HomeTeam", "Home") >= 0 &&
    columnIndex(table.headers, "AwayTeam", "Away") >= 0;
  const hasGoals =
    columnIndex(table.headers, "FTHG", "FTAG", "HG", "AG") >= 0;
  return hasTeams && !hasGoals;
}

function readOdds(
  table: CsvTable,
  row: string[],
  prefix: "pre" | "closing",
  block: "1x2" | "totals",
): Record<string, number> | null {
  if (block === "1x2") {
    const names =
      prefix === "pre"
        ? (["AvgH", "AvgD", "AvgA"] as const)
        : (["AvgCH", "AvgCD", "AvgCA"] as const);
    const values = names.map((name) => parseDecimal(cell(row, table.headers, name)));
    if (values.some((value) => value === null)) {
      // Fallback a Bet365 si no hay promedio de mercado.
      const fallback =
        prefix === "pre"
          ? (["B365H", "B365D", "B365A"] as const)
          : (["B365CH", "B365CD", "B365CA"] as const);
      const alternative = fallback.map((name) =>
        parseDecimal(cell(row, table.headers, name)),
      );
      if (alternative.some((value) => value === null)) return null;
      return {
        home: alternative[0]!,
        draw: alternative[1]!,
        away: alternative[2]!,
      };
    }
    return { home: values[0]!, draw: values[1]!, away: values[2]! };
  }

  const names =
    prefix === "pre"
      ? (["Avg>2.5", "Avg<2.5"] as const)
      : (["AvgC>2.5", "AvgC<2.5"] as const);
  const values = names.map((name) => parseDecimal(cell(row, table.headers, name)));
  if (values.some((value) => value === null)) {
    const fallback =
      prefix === "pre"
        ? (["B365>2.5", "B365<2.5"] as const)
        : (["B365C>2.5", "B365C<2.5"] as const);
    const alternative = fallback.map((name) =>
      parseDecimal(cell(row, table.headers, name)),
    );
    if (alternative.some((value) => value === null)) return null;
    return { over25: alternative[0]!, under25: alternative[1]! };
  }
  return { over25: values[0]!, under25: values[1]! };
}

function buildOdds(
  table: CsvTable,
  row: string[],
  { closingOnly }: { closingOnly: boolean },
): Record<string, unknown> | null {
  const pre = closingOnly
    ? null
    : {
        ...(readOdds(table, row, "pre", "1x2") ?? {}),
        ...(readOdds(table, row, "pre", "totals") ?? {}),
      };
  const closing = {
    ...(readOdds(table, row, "closing", "1x2") ?? {}),
    ...(readOdds(table, row, "closing", "totals") ?? {}),
  };
  const preHas = pre && Object.keys(pre).length > 0;
  const closingHas = Object.keys(closing).length > 0;
  if (!preHas && !closingHas) return null;
  return {
    ...(preHas ? { pre } : {}),
    ...(closingHas ? { closing } : {}),
  };
}

function buildStats(
  table: CsvTable,
  row: string[],
): Record<string, number> | null {
  const stats: Record<string, number> = {};
  const columns: Record<string, string[]> = {
    shotsHome: ["HS"],
    shotsAway: ["AS"],
    shotsOnTargetHome: ["HST"],
    shotsOnTargetAway: ["AST"],
    foulsHome: ["HF"],
    foulsAway: ["AF"],
    cornersHome: ["HC"],
    cornersAway: ["AC"],
    yellowHome: ["HY"],
    yellowAway: ["AY"],
    redHome: ["HR"],
    redAway: ["AR"],
    xgHome: ["HxG"],
    xgAway: ["AxG"],
  };
  for (const [key, names] of Object.entries(columns)) {
    const value = parseDecimal(cell(row, table.headers, ...names));
    if (value !== null) stats[key] = value;
  }
  return Object.keys(stats).length > 0 ? stats : null;
}

function rowNumber(index: number): number {
  return index + 2; // +1 cabecera, +1 base 1
}

export function parseAnalysisFile(
  text: string,
  sourceFile: string,
  encoding = "UTF-8",
): ParsedFile {
  const table = parseCsv(text);
  const extra = isExtraTable(table);
  const fixture = isFixturePath(sourceFile) || isFixtureTable(table);
  const warnings: string[] = [];

  if (fixture) {
    return parseFixtureTable(table, sourceFile, encoding);
  }

  if (!extra && !table.headers.includes("Div")) {
    return {
      format: "unsupported",
      rows: [],
      fixtures: [],
      warnings: ["Formato CSV no reconocido."],
      skippedOld: 0,
      skippedInvalid: 0,
      skippedMissingScore: 0,
      duplicatesInFile: 0,
      encoding,
      delimiter: table.delimiter,
    };
  }

  const base = sourceFile.split("/").pop()?.replace(/\.csv$/i, "") ?? "";
  const seasonFolder = /^\d{2}-\d{2}$/.test(sourceFile.split("/")[1] ?? "")
    ? sourceFile.split("/")[1]
    : null;
  const rows: HistoricalRow[] = [];
  const seen = new Set<string>();
  let skippedOld = 0;
  let skippedInvalid = 0;
  let skippedMissingScore = 0;
  let duplicatesInFile = 0;

  for (let index = 0; index < table.rows.length; index += 1) {
    const row = table.rows[index]!;
    const dateValue = cell(row, table.headers, "Date");
    const date = parseCsvDate(dateValue);
    if (!date) {
      skippedInvalid += 1;
      continue;
    }
    if (date < ANALYSIS_MIN_SEASON_START) {
      skippedOld += 1;
      continue;
    }

    const homeName = cell(row, table.headers, "HomeTeam", "Home");
    const awayName = cell(row, table.headers, "AwayTeam", "Away");
    if (!homeName || !awayName) {
      skippedInvalid += 1;
      continue;
    }

    const homeGoals = parseInteger(
      cell(row, table.headers, extra ? "HG" : "FTHG"),
    );
    const awayGoals = parseInteger(
      cell(row, table.headers, extra ? "AG" : "FTAG"),
    );
    if (homeGoals === null || awayGoals === null) {
      skippedMissingScore += 1;
      continue;
    }

    const seasonValue = extra ? cell(row, table.headers, "Season") : null;
    const seasonStart = seasonFolder
      ? 2000 + Number(seasonFolder.slice(0, 2))
      : parseSeasonStart(seasonValue, date);
    const label = seasonLabel(seasonValue, seasonStart, extra);

    const code = extra
      ? base
      : cell(row, table.headers, "Div") || base;
    const competition = competitionForCode(
      code,
      extra,
      cell(row, table.headers, "Country"),
      cell(row, table.headers, "League"),
    );

    const result =
      cell(row, table.headers, extra ? "Res" : "FTR") ||
      (homeGoals > awayGoals ? "H" : homeGoals < awayGoals ? "A" : "D");

    const odds = buildOdds(table, row, { closingOnly: extra });
    const stats = extra ? null : buildStats(table, row);
    const key = `${competition.competition}|${label}|${date.toISOString()}|${normalizeTeamName(homeName)}|${normalizeTeamName(awayName)}`;
    if (seen.has(key)) {
      duplicatesInFile += 1;
      continue;
    }
    seen.add(key);

    rows.push({
      competition,
      season: label,
      seasonStart,
      playedAt: date,
      homeName,
      awayName,
      homeGoals,
      awayGoals,
      result,
      odds,
      stats,
      sourceFile,
      rowNumber: rowNumber(index),
    });
  }

  return {
    format: "historical",
    rows,
    fixtures: [],
    warnings,
    skippedOld,
    skippedInvalid,
    skippedMissingScore,
    duplicatesInFile,
    encoding,
    delimiter: table.delimiter,
  };
}

function parseFixtureTable(
  table: CsvTable,
  sourceFile: string,
  encoding: string,
): ParsedFile {
  const rows: FixtureRow[] = [];
  const seen = new Set<string>();
  let skippedInvalid = 0;
  const skippedMissingScore = 0;
  let skippedOld = 0;
  let duplicatesInFile = 0;
  const base = sourceFile.split("/").pop()?.replace(/\.csv$/i, "") ?? "";
  const now = new Date();

  for (let index = 0; index < table.rows.length; index += 1) {
    const row = table.rows[index]!;
    const dateValue = cell(row, table.headers, "Date");
    const kickoff = parseCsvDateTime(
      dateValue,
      cell(row, table.headers, "Time"),
      "Europe/London",
    );
    if (!kickoff) {
      skippedInvalid += 1;
      continue;
    }
    if (kickoff <= now) {
      skippedOld += 1;
      continue;
    }

    const homeName = cell(row, table.headers, "HomeTeam", "Home");
    const awayName = cell(row, table.headers, "AwayTeam", "Away");
    if (!homeName || !awayName) {
      skippedInvalid += 1;
      continue;
    }

    const code = cell(row, table.headers, "Div") || base;
    const competition = competitionForCode(code, false);
    const odds = buildOdds(table, row, { closingOnly: false });
    const sourceKey = `${FIXTURE_SOURCE}|${competition.code}|${kickoff.toISOString()}|${normalizeTeamName(homeName)}|${normalizeTeamName(awayName)}`;
    if (seen.has(sourceKey)) {
      duplicatesInFile += 1;
      continue;
    }
    seen.add(sourceKey);

    rows.push({
      competition,
      kickoff,
      homeName,
      awayName,
      odds,
      sourceKey,
      sourceFile,
      rowNumber: rowNumber(index),
    });
  }

  return {
    format: "fixtures",
    rows: [],
    fixtures: rows,
    warnings: [],
    skippedOld,
    skippedInvalid,
    skippedMissingScore,
    duplicatesInFile,
    encoding,
    delimiter: table.delimiter,
  };
}

export function resolveTeamName(
  rawName: string,
  aliases: TeamAliasesFile,
): string | null {
  const key = normalizeTeamName(rawName);
  return key ? (aliases.teams[key] ?? null) : null;
}
