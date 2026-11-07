import { zonedDateTimeToUtc } from "@/lib/date";

export type CsvEncoding = "UTF-8" | "UTF-8+BOM" | "Windows-1252";

export type CsvTable = {
  headers: string[];
  rows: string[][];
  delimiter: "," | ";";
};

/** Decodifica BOM UTF-8 y cae a Windows-1252 si el archivo no es UTF-8. */
export function decodeCsvBuffer(buffer: Buffer): {
  text: string;
  encoding: CsvEncoding;
} {
  const hasBom =
    buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const raw = hasBom ? buffer.subarray(3) : buffer;

  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(raw),
      encoding: hasBom ? "UTF-8+BOM" : "UTF-8",
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(raw),
      encoding: "Windows-1252",
    };
  }
}

export function detectDelimiter(text: string): "," | ";" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    const char = firstLine[index];
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") commas += 1;
    else if (!quoted && char === ";") semicolons += 1;
  }
  return semicolons > commas ? ";" : ",";
}

/** Parser CSV mínimo pero correcto para comas, comillas y saltos CRLF. */
export function parseCsv(text: string, delimiter?: "," | ";"): CsvTable {
  const normalized = text.replace(/^\uFEFF/, "");
  const separator = delimiter ?? detectDelimiter(normalized);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (quoted) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) pushRow();

  const nonEmpty = rows.filter((item) =>
    item.some((value) => value.trim().length > 0),
  );
  const header = (nonEmpty.shift() ?? []).map((value) => value.trim());
  const width = header.length;

  return {
    headers: header,
    rows: nonEmpty.map((item) =>
      width > 0 ? item.slice(0, width) : item,
    ),
    delimiter: separator,
  };
}

export function columnIndex(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

export function cell(
  row: string[],
  headers: string[],
  ...names: string[]
): string {
  const index = columnIndex(headers, ...names);
  return index >= 0 ? (row[index] ?? "").trim() : "";
}

/** Fechas football-data: dd/mm/yy o dd/mm/yyyy. Se guardan a mediodía UTC. */
export function parseCsvDate(value: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Convierte fecha + hora local de la fuente (Reino Unido) a UTC. */
export function parseCsvDateTime(
  date: string,
  time: string,
  timeZone = "Europe/London",
): Date | null {
  const parsedDate = parseCsvDate(date);
  if (!parsedDate) return null;
  const ymd = parsedDate.toISOString().slice(0, 10);
  const clock = /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim() : "12:00";
  const [hour, minute] = clock.split(":").map(Number);
  if (
    hour === undefined ||
    minute === undefined ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }
  return zonedDateTimeToUtc(
    `${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    timeZone,
  );
}

export function parseSeasonStart(
  season: string | null | undefined,
  date: Date,
): number {
  const value = (season ?? "").trim();
  const slash = /^(\d{4})\s*[/-]\s*\d{2,4}$/.exec(value);
  if (slash?.[1]) return Number(slash[1]);
  const year = /^(\d{4})$/.exec(value);
  if (year?.[1]) return Number(year[1]);
  return date.getUTCMonth() + 1 >= 7
    ? date.getUTCFullYear()
    : date.getUTCFullYear() - 1;
}

export function seasonLabel(
  season: string | null | undefined,
  startYear: number,
  annual = false,
): string {
  const value = (season ?? "").trim();
  if (value) return value;
  return annual
    ? String(startYear)
    : `${startYear}/${String(startYear + 1).slice(-2)}`;
}

export function parseInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDecimal(value: string): number | null {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

export function compactRow(headers: string[], row: string[]): string[] {
  const copy = [...row];
  while (copy.length > 0 && (copy[copy.length - 1] ?? "").trim() === "") {
    copy.pop();
  }
  return copy.slice(0, headers.length);
}
