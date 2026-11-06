import { describe, expect, it } from "vitest";

import {
  combineBuilderResults,
  resolveLegStatus,
  resolveSelection,
} from "./auto-settle";

const score = (home: number, away: number) => ({ home, away });

describe("resolveSelection · MATCH_RESULT", () => {
  it.each([
    [2, 1, "HOME", "WON"],
    [1, 1, "DRAW", "WON"],
    [0, 2, "AWAY", "WON"],
    [2, 1, "DRAW", "LOST"],
    [0, 2, "HOME", "LOST"],
  ] as const)("%i-%i %s → %s", (h, a, pick, expected) => {
    expect(
      resolveSelection({ marketKey: "MATCH_RESULT", pick, line: null }, score(h, a)),
    ).toBe(expected);
  });
});

describe("resolveSelection · DOUBLE_CHANCE", () => {
  it.each([
    [1, 1, "HOME_DRAW", "WON"],
    [1, 1, "DRAW_AWAY", "WON"],
    [1, 1, "HOME_AWAY", "LOST"],
    [2, 0, "HOME_AWAY", "WON"],
    [0, 2, "DRAW_AWAY", "WON"],
  ] as const)("%i-%i %s → %s", (h, a, pick, expected) => {
    expect(
      resolveSelection({ marketKey: "DOUBLE_CHANCE", pick, line: null }, score(h, a)),
    ).toBe(expected);
  });
});

describe("resolveSelection · DRAW_NO_BET", () => {
  it("devuelve VOID en empate", () => {
    expect(
      resolveSelection({ marketKey: "DRAW_NO_BET", pick: "HOME", line: null }, score(1, 1)),
    ).toBe("VOID");
  });

  it("gana o pierde según el resultado", () => {
    expect(
      resolveSelection({ marketKey: "DRAW_NO_BET", pick: "HOME", line: null }, score(2, 0)),
    ).toBe("WON");
    expect(
      resolveSelection({ marketKey: "DRAW_NO_BET", pick: "AWAY", line: null }, score(2, 0)),
    ).toBe("LOST");
  });
});

describe("resolveSelection · BTTS", () => {
  it.each([
    [2, 1, "YES", "WON"],
    [2, 1, "NO", "LOST"],
    [1, 0, "NO", "WON"],
    [1, 0, "YES", "LOST"],
  ] as const)("%i-%i %s → %s", (h, a, pick, expected) => {
    expect(
      resolveSelection({ marketKey: "BTTS", pick, line: null }, score(h, a)),
    ).toBe(expected);
  });
});

describe("resolveSelection · TOTAL_GOALS", () => {
  it.each([
    [3, 2.5, "OVER", "WON"],
    [2, 2.5, "UNDER", "WON"],
    [3, 3, "OVER", "VOID"],
    [3, 3, "UNDER", "VOID"],
    [2, 2.25, "OVER", "HALF_LOST"],
    [2, 2.25, "UNDER", "HALF_WON"],
    [3, 2.75, "OVER", "HALF_WON"],
    [3, 2.75, "UNDER", "HALF_LOST"],
    [2, 2.75, "OVER", "LOST"],
    [1, 1.5, "UNDER", "WON"],
  ] as const)("total %i línea %s %s → %s", (total, line, pick, expected) => {
    const home = Math.min(total, 1);
    expect(
      resolveSelection(
        { marketKey: "TOTAL_GOALS", pick, line },
        score(home, total - home),
      ),
    ).toBe(expected);
  });

  it("devuelve null sin línea o con pick inválido", () => {
    expect(
      resolveSelection({ marketKey: "TOTAL_GOALS", pick: "OVER", line: null }, score(1, 0)),
    ).toBeNull();
    expect(
      resolveSelection({ marketKey: "TOTAL_GOALS", pick: "MAYBE", line: 2.5 }, score(1, 0)),
    ).toBeNull();
  });
});

describe("resolveSelection · CUSTOM", () => {
  it("no es auto-liquidable", () => {
    expect(
      resolveSelection({ marketKey: "CUSTOM", pick: null, line: null }, score(1, 0)),
    ).toBeNull();
  });
});

describe("resolveSelection · ASIAN_HANDICAP", () => {
  it.each([
    [2, 1, -0.5, "HOME", "WON"],
    [1, 1, -0.5, "HOME", "LOST"],
    [2, 1, -1, "HOME", "VOID"],
    [1, 1, 1, "HOME", "WON"],
    [1, 1, 1, "AWAY", "LOST"],
    [2, 0, 0, "AWAY", "LOST"],
    [1, 1, -0.25, "HOME", "HALF_LOST"],
    [2, 1, -0.25, "HOME", "WON"],
  ] as const)("%i-%i línea %s %s → %s", (h, a, line, pick, expected) => {
    expect(
      resolveSelection(
        { marketKey: "ASIAN_HANDICAP", pick, line },
        score(h, a),
      ),
    ).toBe(expected);
  });
});

describe("resolveSelection · TEAM_TOTAL_GOALS", () => {
  it.each([
    [2, 1, 1.5, "HOME_OVER", "WON"],
    [2, 1, 1.5, "HOME_UNDER", "LOST"],
    [2, 0, 0.5, "AWAY_UNDER", "WON"],
    [2, 1, 1.5, "AWAY_UNDER", "WON"],
    [1, 0, 1.25, "HOME_OVER", "HALF_LOST"],
  ] as const)("%i-%i línea %s %s → %s", (h, a, line, pick, expected) => {
    expect(
      resolveSelection(
        { marketKey: "TEAM_TOTAL_GOALS", pick, line },
        score(h, a),
      ),
    ).toBe(expected);
  });
});

describe("resolveSelection · ODD_EVEN", () => {
  it.each([
    [2, 1, "ODD", "WON"],
    [2, 1, "EVEN", "LOST"],
    [1, 1, "EVEN", "WON"],
  ] as const)("%i-%i %s → %s", (h, a, pick, expected) => {
    expect(
      resolveSelection({ marketKey: "ODD_EVEN", pick, line: null }, score(h, a)),
    ).toBe(expected);
  });
});

describe("resolveSelection · WIN_TO_NIL", () => {
  it.each([
    [2, 0, "HOME", "WON"],
    [2, 1, "HOME", "LOST"],
    [0, 1, "AWAY", "WON"],
    [1, 1, "AWAY", "LOST"],
  ] as const)("%i-%i %s → %s", (h, a, pick, expected) => {
    expect(
      resolveSelection({ marketKey: "WIN_TO_NIL", pick, line: null }, score(h, a)),
    ).toBe(expected);
  });
});

describe("resolveSelection · EXACT_TOTAL_GOALS", () => {
  it.each([
    [3, 3, "WON"],
    [3, 2, "LOST"],
  ] as const)("total %i con línea %s → %s", (total, line, expected) => {
    const home = Math.min(total, 1);
    expect(
      resolveSelection(
        { marketKey: "EXACT_TOTAL_GOALS", pick: "EXACT", line },
        score(home, total - home),
      ),
    ).toBe(expected);
  });

  it("sin línea no resuelve", () => {
    expect(
      resolveSelection(
        { marketKey: "EXACT_TOTAL_GOALS", pick: "EXACT", line: null },
        score(1, 0),
      ),
    ).toBeNull();
  });
});

describe("combineBuilderResults", () => {
  it("todas WON → WON", () => {
    expect(combineBuilderResults(["WON", "WON"])).toBe("WON");
  });

  it("alguna LOST → LOST", () => {
    expect(combineBuilderResults(["WON", "LOST"])).toBe("LOST");
  });

  it("mezclas con VOID o HALF → null (revisión manual)", () => {
    expect(combineBuilderResults(["WON", "VOID"])).toBeNull();
    expect(combineBuilderResults(["HALF_WON", "WON"])).toBeNull();
  });
});

describe("resolveLegStatus", () => {
  const selection = { marketKey: "MATCH_RESULT" as const, pick: "HOME", line: null };

  it("un leg simple usa su única selección", () => {
    expect(resolveLegStatus({ isBuilder: false, selections: [selection] }, score(2, 0))).toBe(
      "WON",
    );
  });

  it("un builder exige que todas sus selecciones sean resolubles", () => {
    expect(
      resolveLegStatus(
        {
          isBuilder: true,
          selections: [
            selection,
            { marketKey: "BTTS", pick: "NO", line: null },
          ],
        },
        score(2, 0),
      ),
    ).toBe("WON");
  });

  it("usa subject para goles de un equipo (diseño nuevo)", () => {
    expect(
      resolveSelection(
        {
          marketKey: "TEAM_TOTAL_GOALS",
          pick: "OVER",
          line: 1.5,
          subject: "AWAY",
        },
        score(2, 2),
      ),
    ).toBe("WON");
    expect(
      resolveSelection(
        {
          marketKey: "TEAM_TOTAL_GOALS",
          pick: "UNDER",
          line: 2.5,
          subject: "AWAY",
        },
        score(2, 2),
      ),
    ).toBe("WON");
  });

  it("córneres, tarjetas y líneas genéricas quedan manuales", () => {
    for (const marketKey of [
      "TOTAL_CORNERS",
      "TOTAL_CARDS",
      "GENERIC_LINE",
    ] as const) {
      expect(
        resolveSelection(
          { marketKey, pick: "OVER", line: 9.5 },
          score(2, 1),
        ),
      ).toBeNull();
    }
  });

  it("un builder con un mercado manual queda sin resolver", () => {
    expect(
      resolveLegStatus(
        {
          isBuilder: true,
          selections: [
            selection,
            { marketKey: "CUSTOM", pick: null, line: null },
          ],
        },
        score(2, 0),
      ),
    ).toBeNull();
  });
});
