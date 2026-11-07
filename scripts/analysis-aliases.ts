import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { decodeCsvBuffer, parseCsv } from "../src/lib/analysis/csv";
import {
  isTeamAliasesFile,
  normalizeTeamName,
  suggestTeamAliases,
  type TeamAliasesFile,
} from "../src/lib/analysis/team-names";

function loadEnv() {
  if (!existsSync(".env")) return;
  const text = readFileSync(".env", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match?.[1]) continue;
    process.env[match[1]] ??= (match[2] ?? "").replace(/^["']|["']$/g, "");
  }
}

function walk(dir: string, result: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, result);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".csv")) {
      result.push(full);
    }
  }
  return result;
}

loadEnv();
const aliasPath = process.env.TEAM_ALIASES_FILE ?? "team-aliases.json";
if (!existsSync(aliasPath)) {
  console.error(`No existe ${aliasPath}`);
  process.exit(1);
}
const rawAliases = JSON.parse(readFileSync(aliasPath, "utf8"));
if (!isTeamAliasesFile(rawAliases)) {
  console.error("team-aliases.json no tiene el formato esperado.");
  process.exit(1);
}
const aliases: TeamAliasesFile = rawAliases;
const knownKeys = Object.keys(aliases.teams);

const requested =
  process.argv[2] ?? process.env.ANALYSIS_DATA_DIR ?? "data-football";
const input = resolve(requested);
if (!existsSync(input)) {
  console.error(`No existe la ruta ${input}`);
  process.exit(1);
}
const files = walk(input);
const missing = new Map<string, Set<string>>();

for (const file of files) {
  try {
    const decoded = decodeCsvBuffer(readFileSync(file));
    const table = parseCsv(decoded.text);
    const homeIndex = table.headers.indexOf("HomeTeam") >= 0 ? table.headers.indexOf("HomeTeam") : table.headers.indexOf("Home");
    const awayIndex = table.headers.indexOf("AwayTeam") >= 0 ? table.headers.indexOf("AwayTeam") : table.headers.indexOf("Away");
    if (homeIndex < 0 || awayIndex < 0) continue;

    for (const row of table.rows) {
      for (const raw of [row[homeIndex], row[awayIndex]]) {
        if (!raw) continue;
        const key = normalizeTeamName(raw);
        if (!key || aliases.teams[key]) continue;
        const names = missing.get(key) ?? new Set<string>();
        names.add(raw);
        missing.set(key, names);
      }
    }
  } catch (error) {
    console.warn(`[skip] ${file}: ${String(error)}`);
  }
}

console.log(`Archivos escaneados: ${files.length}`);
console.log(`Equipos sin alias: ${missing.size}`);

if (missing.size === 0) {
  console.log("No hay nombres sin resolver.");
  process.exit(0);
}

for (const [key, names] of [...missing.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const suggestions = suggestTeamAliases([...names][0] ?? key, knownKeys, 3);
  console.log(
    `- ${[...names].join(" / ")}  [${key}]${
      suggestions.length > 0 ? `  sugerencias: ${suggestions.join(", ")}` : ""
    }`,
  );
}
console.log("");
console.log(
  "Edita team-aliases.json y añade la clave normalizada. El importer no crea alias automáticamente.",
);
