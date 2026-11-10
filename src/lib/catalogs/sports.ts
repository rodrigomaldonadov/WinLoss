/** Catálogo canónico de deportes de la app. */
export const SPORT_OPTIONS = [
  "Fútbol",
  "Tenis",
  "Baloncesto",
  "Béisbol",
  "Fútbol americano",
  "Hockey",
  "Voleibol",
  "MMA/UFC",
  "Boxeo",
  "Rugby",
  "Fórmula 1",
  "Ciclismo",
  "Golf",
  "Cricket",
  "Tenis de mesa",
  "Balonmano",
  "Dardos",
  "eSports",
  "Otros",
] as const;

export type SportOption = (typeof SPORT_OPTIONS)[number];

export const OTHER_SPORT = "Otros" satisfies SportOption;

export function isSportOption(value: string): value is SportOption {
  return (SPORT_OPTIONS as readonly string[]).includes(value);
}

/** Normaliza nombres de deporte de proveedores externos a nuestro catálogo. */
export function normalizeSport(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("american") || normalized.includes("americano")) {
    return "Fútbol americano";
  }
  if (
    normalized.includes("soccer") ||
    normalized.includes("fútbol") ||
    normalized.includes("futbol") ||
    normalized.includes("football")
  ) {
    return "Fútbol";
  }
  if (
    normalized.includes("table tennis") ||
    normalized.includes("table-tennis") ||
    normalized.includes("tenis de mesa") ||
    normalized.includes("ping pong")
  ) {
    return "Tenis de mesa";
  }
  if (normalized.includes("tennis")) return "Tenis";
  if (normalized.includes("basket")) return "Baloncesto";
  if (normalized.includes("baseball") || normalized.includes("béisbol")) {
    return "Béisbol";
  }
  if (normalized.includes("hockey")) return "Hockey";
  if (normalized.includes("volley") || normalized.includes("voleibol")) {
    return "Voleibol";
  }
  if (normalized.includes("mma") || normalized.includes("ufc")) return "MMA/UFC";
  if (normalized.includes("box")) return "Boxeo";
  if (normalized.includes("rugby")) return "Rugby";
  if (normalized.includes("golf")) return "Golf";
  if (normalized.includes("cricket")) return "Cricket";
  if (normalized.includes("handball") || normalized.includes("balonmano")) {
    return "Balonmano";
  }
  if (normalized.includes("darts") || normalized.includes("dardos")) {
    return "Dardos";
  }
  if (normalized.includes("cycling") || normalized.includes("ciclismo")) {
    return "Ciclismo";
  }
  if (normalized === "f1" || normalized.includes("formula")) return "Fórmula 1";
  if (normalized.includes("esport") || normalized.includes("e-sport")) {
    return "eSports";
  }
  return value.trim() || "Otros";
}
