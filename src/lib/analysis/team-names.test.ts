import { describe, expect, it } from "vitest";

import {
  levenshtein,
  normalizeTeamName,
  suggestTeamAliases,
} from "./team-names";

describe("normalizeTeamName", () => {
  it("quita mayúsculas, acentos y sufijos de club", () => {
    expect(normalizeTeamName("FC Barcelona")).toBe("barcelona");
    expect(normalizeTeamName("1. FC Köln")).toBe("koln");
    expect(normalizeTeamName("AS Roma")).toBe("roma");
    expect(normalizeTeamName("SC Internacional")).toBe("internacional");
  });

  it("conserva números que no son de división", () => {
    expect(normalizeTeamName("1899 Hoffenheim")).toBe("1899 hoffenheim");
  });
});

describe("sugerencias de alias", () => {
  it("calcula Levenshtein", () => {
    expect(levenshtein("inter", "inter")).toBe(0);
    expect(levenshtein("inter", "internazionale")).toBeGreaterThan(0);
  });

  it("sugiere sin resolver automáticamente", () => {
    const suggestions = suggestTeamAliases("Arsenall", [
      "man united",
      "man city",
      "arsenal",
    ]);
    expect(suggestions[0]).toBe("arsenal");
  });
});
