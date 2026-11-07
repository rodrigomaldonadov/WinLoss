import { describe, expect, it } from "vitest";

import { buildAnalysisPrefill } from "./prefill";

describe("buildAnalysisPrefill", () => {
  it("precarga solo el evento y la fecha, sin inventar cuota ni selección", () => {
    const defaults = buildAnalysisPrefill({
      evento: "Arsenal vs Chelsea",
      competicion: "Premier League",
      fecha: "2026-11-10T20:00:00.000Z",
      deporte: "Fútbol",
    });

    expect(defaults).not.toBeNull();
    expect(defaults?.eventName).toBe("Arsenal vs Chelsea");
    expect(defaults?.competition).toBe("Premier League");
    expect(defaults?.sport).toBe("Fútbol");
    expect(defaults?.legs?.[0]?.eventDate).toBe("2026-11-10");
    expect(defaults?.legs?.[0]?.odds).toBeUndefined();
    expect(defaults?.legs?.[0]?.selections?.[0]?.market).toBe("");
    expect(defaults?.legs?.[0]?.selections?.[0]?.selection).toBe("");
  });

  it("no precarga nada si falta el evento o la fecha no es válida", () => {
    expect(buildAnalysisPrefill({ competicion: "Premier League" })).toBeNull();
    const defaults = buildAnalysisPrefill({
      evento: "Arsenal vs Chelsea",
      fecha: "no-es-fecha",
    });
    expect(defaults?.legs?.[0]?.eventDate).toBeNull();
  });
});
