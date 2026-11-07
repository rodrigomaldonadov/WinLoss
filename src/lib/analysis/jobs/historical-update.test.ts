import { describe, expect, it } from "vitest";

import {
  currentSeasonStart,
  isCurrentSeasonRow,
  planHistoricalUpdates,
  stableStringify,
  type ExistingHistorical,
  type HistoricalValue,
} from "./historical-update";

const now = new Date("2026-11-07T12:00:00.000Z");
const playedAt = new Date("2026-08-01T19:00:00.000Z");

function record(overrides: Partial<HistoricalValue> = {}): HistoricalValue {
  return {
    competition: "Premier League",
    competitionCode: "E0",
    season: "2026/27",
    seasonStart: 2026,
    playedAt,
    homeTeamId: "home",
    awayTeamId: "away",
    homeGoals: 2,
    awayGoals: 0,
    result: "H",
    odds: {
      pre: { home: 1.8, draw: 3.5, away: 4.2 },
      closing: { home: 1.75, draw: 3.6, away: 4 },
    },
    stats: { shotsHome: 10 },
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingHistorical> = {}): ExistingHistorical {
  return {
    id: "row-1",
    ...record(),
    ...overrides,
  };
}

describe("temporada en curso", () => {
  it("detecta ligas anuales y de calendario europeo", () => {
    expect(currentSeasonStart("2026", now)).toBe(2026);
    expect(currentSeasonStart("2026/27", now)).toBe(2026);
    expect(currentSeasonStart("2026/27", new Date("2026-03-01"))).toBe(2025);
    expect(currentSeasonStart("2026", new Date("2026-03-01"))).toBe(2026);
  });

  it("solo trata como actuales las filas de la temporada vigente", () => {
    expect(isCurrentSeasonRow(record(), now)).toBe(true);
    expect(
      isCurrentSeasonRow(
        record({ season: "2022/23", seasonStart: 2022 }),
        now,
      ),
    ).toBe(false);
  });
});

describe("planHistoricalUpdates", () => {
  it("actualiza una fila con marcador corregido", () => {
    const updates = planHistoricalUpdates(
      [record({ homeGoals: 2, awayGoals: 1 })],
      [existing({ homeGoals: 1, awayGoals: 0 })],
      now,
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]?.data).toMatchObject({
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  it("actualiza cuando aparece la cuota de cierre", () => {
    const updates = planHistoricalUpdates(
      [
        record({
          odds: {
            pre: { home: 1.8, draw: 3.5, away: 4.2 },
            closing: { home: 1.75, draw: 3.6, away: 4 },
          },
        }),
      ],
      [
        existing({
          odds: { pre: { home: 1.8, draw: 3.5, away: 4.2 } },
        }),
      ],
      now,
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]?.data.odds).toEqual({
      pre: { home: 1.8, draw: 3.5, away: 4.2 },
      closing: { home: 1.75, draw: 3.6, away: 4 },
    });
  });

  it("no toca temporadas cerradas ni filas sin cambios", () => {
    expect(
      planHistoricalUpdates(
        [record({ season: "2022/23", seasonStart: 2022, homeGoals: 3 })],
        [existing({ season: "2022/23", seasonStart: 2022, homeGoals: 1 })],
        now,
      ),
    ).toEqual([]);

    expect(planHistoricalUpdates([record()], [existing()], now)).toEqual([]);
  });

  it("compara JSON sin depender del orden de claves", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });
});
