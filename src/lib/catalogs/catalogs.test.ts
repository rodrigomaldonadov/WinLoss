import { describe, expect, it } from "vitest";

import {
  COMPETITIONS_BY_SPORT,
  findCompetition,
  getCompetitionsForSport,
  groupCompetitionsByRegion,
} from "./competitions";
import { SPORT_OPTIONS, normalizeSport } from "./sports";

const all = Object.values(COMPETITIONS_BY_SPORT).flat();

describe("catálogo de deportes", () => {
  it("cubre todos los deportes declarados", () => {
    expect(Object.keys(COMPETITIONS_BY_SPORT).sort()).toEqual(
      [...SPORT_OPTIONS].sort(),
    );
  });

  it("incluye los deportes requeridos", () => {
    expect(SPORT_OPTIONS).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it("normaliza deportes de proveedores al catálogo", () => {
    expect(normalizeSport("Table Tennis")).toBe("Tenis de mesa");
    expect(normalizeSport("Handball")).toBe("Balonmano");
    expect(normalizeSport("Cycling")).toBe("Ciclismo");
    expect(normalizeSport("American Football")).toBe("Fútbol americano");
    expect(normalizeSport("Darts")).toBe("Dardos");
    expect(normalizeSport("Cricket")).toBe("Cricket");
    expect(normalizeSport("Golf")).toBe("Golf");
  });
});

describe("catálogo de competiciones", () => {
  it("no repite valores entre deportes", () => {
    const values = all.map((competition) => competition.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("todas tienen value, label y region válidos", () => {
    for (const competition of all) {
      expect(competition.value).toMatch(/^[a-z0-9-]+$/);
      expect(competition.label.trim().length).toBeGreaterThan(0);
      expect(competition.region.trim().length).toBeGreaterThan(0);
      if (competition.providerKeys) {
        for (const key of Object.keys(competition.providerKeys)) {
          expect(["footballData", "sportsDb"]).toContain(key);
        }
      }
    }
  });

  it("Fútbol incluye Liga 1 y Libertadores", () => {
    const football = getCompetitionsForSport("Fútbol").map((c) => c.label);
    expect(football).toContain("Liga 1");
    expect(football).toContain("Copa Libertadores");
  });

  it("'Otros' no tiene competiciones de catálogo", () => {
    expect(getCompetitionsForSport("Otros")).toHaveLength(0);
  });

  it("agrupa por región preservando el orden", () => {
    const groups = groupCompetitionsByRegion(getCompetitionsForSport("Fútbol"));
    expect(groups.length).toBeGreaterThan(1);
    expect(new Set(groups.map((group) => group.region)).size).toBe(
      groups.length,
    );
    expect(groups[0]?.region).toBe("Perú");
  });

  it("encuentra por label o por value", () => {
    expect(findCompetition("Fútbol", "Liga 1")?.value).toBe(
      "futbol-peru-liga-1",
    );
    expect(findCompetition("Fútbol", "futbol-peru-liga-1")?.label).toBe(
      "Liga 1",
    );
  });
});
