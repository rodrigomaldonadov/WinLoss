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
  if (normalized === "f1" || normalized.includes("formula")) return "Fórmula 1";
  if (normalized.includes("esport") || normalized.includes("e-sport")) {
    return "eSports";
  }
  return value.trim() || "Otros";
}
