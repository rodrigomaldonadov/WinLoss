import { describe, expect, it } from "vitest";

import { shouldRefreshRatings } from "./generate-job";

const DAY_MS = 86_400_000;
const now = new Date("2026-11-07T12:00:00.000Z");

describe("shouldRefreshRatings", () => {
  it("reajusta si no hay ratings", () => {
    expect(shouldRefreshRatings(null, now, 7 * DAY_MS)).toBe(true);
  });

  it("reutiliza ratings de hace menos de una semana", () => {
    expect(
      shouldRefreshRatings(
        new Date(now.getTime() - 6 * DAY_MS),
        now,
        7 * DAY_MS,
      ),
    ).toBe(false);
  });

  it("reajusta cuando pasaron siete días o más", () => {
    expect(
      shouldRefreshRatings(
        new Date(now.getTime() - 7 * DAY_MS),
        now,
        7 * DAY_MS,
      ),
    ).toBe(true);
  });
});
