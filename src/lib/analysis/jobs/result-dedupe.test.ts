import { describe, expect, it } from "vitest";

import { localDateKey, resultDedupeKey, seasonForResult } from "./result-dedupe";

describe("resultDedupeKey", () => {
  it("usa fecha local y equipos canónicos", () => {
    const playedAt = new Date("2026-11-07T23:30:00.000Z");
    const key = resultDedupeKey({
      competition: "Premier League",
      competitionCode: "E0",
      playedAt,
      homeTeamId: "arsenal",
      awayTeamId: "chelsea",
    });
    expect(key).toBe("Premier League|2026-11-07|arsenal|chelsea");
    expect(localDateKey(playedAt, "E0")).toBe("2026-11-07");
  });

  it("cambia de día en la zona local de la competición", () => {
    // 23:30 UTC ya es 00:30 del día siguiente en Madrid.
    const playedAt = new Date("2026-11-07T23:30:00.000Z");
    expect(localDateKey(playedAt, "SP1")).toBe("2026-11-08");
  });

  it("calcula temporada anual o de calendario europeo", () => {
    expect(seasonForResult("BRA", new Date("2026-03-01T12:00:00Z"))).toEqual({
      seasonStart: 2026,
      season: "2026",
    });
    expect(seasonForResult("E0", new Date("2026-03-01T12:00:00Z"))).toEqual({
      seasonStart: 2025,
      season: "2025/26",
    });
    expect(seasonForResult("E0", new Date("2026-11-01T12:00:00Z"))).toEqual({
      seasonStart: 2026,
      season: "2026/27",
    });
  });
});
