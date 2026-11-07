import { describe, expect, it } from "vitest";

import { shouldRefreshRatings } from "./generate-job";

const DAY_MS = 86_400_000;
const now = new Date("2026-11-07T12:00:00.000Z");
const today = new Date("2026-11-07T00:00:00.000Z");

function decide(
  latestAsOf: Date | null,
  newResults: number,
  minNewResults = 5,
) {
  return shouldRefreshRatings({
    latestAsOf,
    now,
    newResults,
    minNewResults,
    maxAgeMs: 7 * DAY_MS,
  });
}

describe("shouldRefreshRatings", () => {
  it("reajusta si no hay ratings", () => {
    expect(decide(null, 0)).toMatchObject({
      refresh: true,
      reason: "no-ratings",
    });
  });

  it("reajusta en la primera corrida del día si alcanza el umbral", () => {
    expect(decide(new Date(now.getTime() - 1 * DAY_MS), 5)).toMatchObject({
      refresh: true,
      reason: "new-results",
      newResults: 5,
    });
  });

  it("no reajusta por debajo del umbral", () => {
    expect(decide(new Date(now.getTime() - 1 * DAY_MS), 4)).toMatchObject({
      refresh: false,
      reason: "below-threshold",
    });
  });

  it("no reajusta dos veces el mismo día", () => {
    expect(decide(today, 10)).toMatchObject({
      refresh: false,
      reason: "same-day",
    });
  });

  it("reajusta por respaldo semanal aunque no haya resultados nuevos", () => {
    expect(decide(new Date(now.getTime() - 7 * DAY_MS), 0)).toMatchObject({
      refresh: true,
      reason: "weekly-fallback",
    });
  });
});
