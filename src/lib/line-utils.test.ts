import { describe, expect, it } from "vitest";

import {
  clampLine,
  formatLine,
  isQuarterLine,
  normalizeLine,
  roundToQuarter,
  stepLine,
} from "./line-utils";

describe("roundToQuarter", () => {
  it.each([
    [2.1, 2],
    [2.3, 2.25],
    [2.4, 2.5],
    [2.88, 3],
  ])("%s → %s", (input, expected) => {
    expect(roundToQuarter(input)).toBe(expected);
  });
});

describe("normalizeLine", () => {
  it("acepta coma decimal", () => {
    expect(normalizeLine("2,75")).toBe(2.75);
  });

  it("redondea a cuartos", () => {
    expect(normalizeLine("2.6")).toBe(2.5);
    expect(normalizeLine("2.63")).toBe(2.75);
  });

  it("respeta límites", () => {
    expect(normalizeLine(-3, { min: 0.25, max: 5.5 })).toBe(0.25);
    expect(normalizeLine(99, { min: 0.25, max: 5.5 })).toBe(5.5);
  });

  it("devuelve null si no es numérico", () => {
    expect(normalizeLine("abc")).toBeNull();
    expect(normalizeLine("")).toBeNull();
  });
});

describe("stepLine", () => {
  it("suma y resta 0.5 conservando cuartos", () => {
    expect(stepLine(2.25, 0.5)).toBe(2.75);
    expect(stepLine(2.75, -0.5)).toBe(2.25);
  });

  it("no baja del mínimo ni sube del máximo", () => {
    expect(stepLine(0.25, -0.5, { min: 0.25 })).toBe(0.25);
    expect(stepLine(5.5, 0.5, { max: 5.5 })).toBe(5.5);
  });
});

describe("clampLine e isQuarterLine", () => {
  it("clampea al rango", () => {
    expect(clampLine(0, { min: 0.5, max: 10 })).toBe(0.5);
    expect(clampLine(20, { min: 0.5, max: 10 })).toBe(10);
  });

  it("detecta líneas de cuarto", () => {
    expect(isQuarterLine(2.25)).toBe(true);
    expect(isQuarterLine(2.75)).toBe(true);
    expect(isQuarterLine(2.5)).toBe(false);
    expect(isQuarterLine(3)).toBe(false);
  });
});

describe("formatLine", () => {
  it("no añade ceros innecesarios", () => {
    expect(formatLine(2.5)).toBe("2.5");
    expect(formatLine(2.25)).toBe("2.25");
    expect(formatLine(3)).toBe("3");
  });
});
