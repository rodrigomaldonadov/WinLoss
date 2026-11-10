import { describe, expect, it } from "vitest";

import {
  isSelfExclusionActive,
  startOfWeekInTimeZone,
  stakeToPen,
  weeklyLimitRemaining,
} from "./responsible-gambling";

describe("juego responsable", () => {
  it("calcula el lunes 00:00 de Lima en UTC", () => {
    // Miércoles 11-nov-2026 03:00 UTC = martes 22:00 en Lima.
    const week = startOfWeekInTimeZone(
      new Date("2026-11-11T03:00:00.000Z"),
      "America/Lima",
    );
    expect(week.toISOString()).toBe("2026-11-09T05:00:00.000Z");
  });

  it("mantiene el lunes si ya es lunes", () => {
    const week = startOfWeekInTimeZone(
      new Date("2026-11-09T15:00:00.000Z"),
      "America/Lima",
    );
    expect(week.toISOString()).toBe("2026-11-09T05:00:00.000Z");
  });

  it("detecta la autoexclusión vigente y la vencida", () => {
    const now = new Date("2026-11-11T12:00:00.000Z");
    expect(
      isSelfExclusionActive(new Date("2026-11-12T12:00:00.000Z"), now),
    ).toBe(true);
    expect(
      isSelfExclusionActive(new Date("2026-11-10T12:00:00.000Z"), now),
    ).toBe(false);
    expect(isSelfExclusionActive(null, now)).toBe(false);
  });

  it("convierte USD a PEN y deja PEN igual", () => {
    expect(stakeToPen(10, "USD", 3.75)).toBe(37.5);
    expect(stakeToPen(10, "PEN", 3.75)).toBe(10);
  });

  it("calcula el saldo restante sin bajar de cero", () => {
    expect(weeklyLimitRemaining(100, 25)).toBe(75);
    expect(weeklyLimitRemaining(100, 130)).toBe(0);
    expect(weeklyLimitRemaining(null, 50)).toBeNull();
  });
});
