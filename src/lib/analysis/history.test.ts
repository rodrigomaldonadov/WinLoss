import { describe, expect, it } from "vitest";

import type { TeamAliasesFile } from "@/lib/analysis/team-names";

import {
  EMPTY_HISTORY_FILTERS,
  buildMineIndex,
  historyHref,
  historyMatchKey,
  historyPresetRange,
  historyPresets,
  isHistoryPresetActive,
  isValidDateKey,
  matchIsMine,
  parseHistoryFilters,
  type HistoryFilterState,
} from "./history";

const LIMA = "America/Lima";
const NOW = new Date("2026-11-07T20:00:00.000Z"); // 15:00 en Lima

const aliases: TeamAliasesFile = {
  version: 1,
  teams: {
    "man utd": "Manchester United",
    "atletico": "Atlético de Madrid",
  },
};

function state(overrides: Partial<HistoryFilterState> = {}): HistoryFilterState {
  return { ...EMPTY_HISTORY_FILTERS, ...overrides };
}

describe("parseHistoryFilters", () => {
  it("devuelve los valores por defecto sin parámetros", () => {
    expect(parseHistoryFilters({})).toEqual(EMPTY_HISTORY_FILTERS);
  });

  it("lee todos los filtros de la URL", () => {
    expect(
      parseHistoryFilters({
        q: "  Real Madrid ",
        competicion: ["LaLiga", "Premier League", "LaLiga"],
        desde: "2026-10-01",
        hasta: "2026-10-31",
        modo: "saved",
        mios: "1",
        pagina: "3",
      }),
    ).toEqual({
      query: "Real Madrid",
      competitions: ["LaLiga", "Premier League"],
      from: "2026-10-01",
      to: "2026-10-31",
      mode: "saved",
      mine: true,
      page: 3,
    });
  });

  it("ignora fechas inválidas y ordena el rango invertido", () => {
    expect(
      parseHistoryFilters({
        desde: "2026-11-30",
        hasta: "2026-11-01",
      }),
    ).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });

    expect(
      parseHistoryFilters({ desde: "2026-02-31", hasta: "ayer" }),
    ).toMatchObject({ from: null, to: null });
  });

  it("normaliza un modo desconocido y una página inválida", () => {
    expect(
      parseHistoryFilters({ modo: "otro", pagina: "-4" }),
    ).toMatchObject({ mode: "all", page: 1 });
  });

  it("valida claves de fecha reales", () => {
    expect(isValidDateKey("2026-11-07")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
  });
});

describe("historyHref", () => {
  it("omite los valores por defecto", () => {
    expect(historyHref(EMPTY_HISTORY_FILTERS)).toBe("/analysis/historial");
  });

  it("serializa filtros y conserva competiciones repetidas", () => {
    const href = historyHref(
      state({
        query: "Real Madrid",
        competitions: ["LaLiga", "Premier League"],
        from: "2026-10-01",
        to: "2026-10-31",
        mode: "reconstructed",
        mine: true,
        page: 2,
      }),
    );

    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("q")).toBe("Real Madrid");
    expect(params.getAll("competicion")).toEqual([
      "LaLiga",
      "Premier League",
    ]);
    expect(params.get("desde")).toBe("2026-10-01");
    expect(params.get("hasta")).toBe("2026-10-31");
    expect(params.get("modo")).toBe("reconstructed");
    expect(params.get("mios")).toBe("1");
    expect(params.get("pagina")).toBe("2");
  });
});

describe("rangos rápidos", () => {
  it("calcula la última semana en la zona del usuario", () => {
    expect(historyPresetRange("week", NOW, LIMA)).toEqual({
      from: "2026-11-01",
      to: "2026-11-07",
    });
  });

  it("calcula el último mes como 30 días inclusivos", () => {
    expect(historyPresetRange("month", NOW, LIMA)).toEqual({
      from: "2026-10-09",
      to: "2026-11-07",
    });
  });

  it("marca el chip activo solo con el rango exacto", () => {
    const week = historyPresetRange("week", NOW, LIMA);
    expect(
      isHistoryPresetActive(state(week), "week", NOW, LIMA),
    ).toBe(true);
    expect(
      isHistoryPresetActive(
        state({ from: week.from, to: null }),
        "week",
        NOW,
        LIMA,
      ),
    ).toBe(false);
  });

  it("genera hrefs de preset sin perder otros filtros", () => {
    const presets = historyPresets(
      state({ query: "Arsenal", mine: true, page: 4 }),
      NOW,
      LIMA,
    );

    const params = new URL(presets.month.href, "http://localhost").searchParams;
    expect(params.get("q")).toBe("Arsenal");
    expect(params.get("mios")).toBe("1");
    expect(params.get("desde")).toBe("2026-10-09");
    expect(params.has("pagina")).toBe(false);
  });
});

describe("historyMatchKey", () => {
  it("coincide con la clave de AnalysisSnapshot", () => {
    expect(
      historyMatchKey({
        homeName: "Arsenal",
        awayName: "Chelsea",
        playedAt: new Date("2026-11-07T12:00:00.000Z"),
      }),
    ).toBe("arsenal|chelsea|2026-11-07");
  });
});

describe("mis partidos", () => {
  const playedAt = new Date("2026-11-08T12:00:00.000Z");
  const index = buildMineIndex(
    [
      {
        eventName: "Man Utd vs Chelsea",
        eventDate: new Date("2026-11-07T20:00:00.000Z"),
      },
      {
        eventName: "Sin separador",
        eventDate: new Date("2026-11-07T20:00:00.000Z"),
      },
    ],
    aliases,
  );

  it("marca el partido aunque el orden de los equipos cambie", () => {
    expect(
      matchIsMine(
        index,
        { homeName: "Manchester United", awayName: "Chelsea", playedAt },
        aliases,
      ),
    ).toBe(true);
    expect(
      matchIsMine(
        index,
        { homeName: "Chelsea", awayName: "Manchester United", playedAt },
        aliases,
      ),
    ).toBe(true);
  });

  it("resuelve alias del nombre del equipo", () => {
    expect(
      matchIsMine(
        index,
        { homeName: "Manchester United", awayName: "Chelsea", playedAt },
        aliases,
      ),
    ).toBe(true);
  });

  it("descarta partidos fuera de la tolerancia de 36 h", () => {
    expect(
      matchIsMine(
        index,
        {
          homeName: "Manchester United",
          awayName: "Chelsea",
          playedAt: new Date("2026-11-09T09:00:00.000Z"),
        },
        aliases,
      ),
    ).toBe(false);
  });

  it("descarta otro rival", () => {
    expect(
      matchIsMine(
        index,
        { homeName: "Manchester United", awayName: "Arsenal", playedAt },
        aliases,
      ),
    ).toBe(false);
  });
});
