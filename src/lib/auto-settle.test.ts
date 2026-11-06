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

  it("un builder con un mercado manual queda sin resolver", () => {
    expect(
      resolveLegStatus(
        {
          isBuilder: true,
          selections: [selection, { marketKey: "CUSTOM", pick: null, line: null }],
        },
        score(2, 0),
      ),
    ).toBeNull();
  });
});
