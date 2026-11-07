import { describe, expect, it } from "vitest";

import {
  buildSnapshotRecord,
  hasSnapshotData,
  shouldSnapshot,
} from "./snapshot";
import { buildMarketItem } from "@/test/fixtures/analysis";

const now = new Date("2026-11-07T12:00:00.000Z");

describe("snapshots inmutables", () => {
  it("solo captura antes del inicio", () => {
    expect(shouldSnapshot(new Date("2026-11-08T12:00:00.000Z"), now)).toBe(true);
    expect(shouldSnapshot(new Date("2026-11-07T11:59:00.000Z"), now)).toBe(
      false,
    );
  });

  it("captura mercado, modelo, confianza y versión de ratings", () => {
    const item = buildMarketItem();
    expect(hasSnapshotData(item.final, item.sources)).toBe(true);

    const record = buildSnapshotRecord({
      matchKey: "arsenal|chelsea|2026-11-10",
      externalEventId: "fixture-1",
      competition: item.competition,
      competitionCode: item.competitionCode,
      kickoff: item.kickoff,
      homeName: item.homeName,
      awayName: item.awayName,
      homeTeamId: item.homeTeamId,
      awayTeamId: item.awayTeamId,
      final: item.final,
      sources: item.sources,
      ratingsVersion: "poisson-dc-v1:2026-11-07T00:00:00.000Z",
      ratingsParams: { halfLifeDays: 365, ridge: 70 },
      marketCapturedAt: now,
      marketFresh: true,
      snapshotAt: now,
      challengerProbability: [0.4, 0.3, 0.3],
      challengerVersionId: "challenger-1",
    });

    expect(record).toMatchObject({
      matchKey: "arsenal|chelsea|2026-11-10",
      confidence: "HIGH",
      finalSource: "market",
      ratingsVersion: "poisson-dc-v1:2026-11-07T00:00:00.000Z",
      marketFresh: true,
      challengerVersionId: "challenger-1",
    });
    expect(record.marketProbability).toEqual(item.sources.market.probabilities);
    expect(record.modelProbability).toEqual(item.sources.model.probabilities);
    expect(record.finalProbability).toEqual(item.final.probabilities);
    expect(record.challengerProbability).toEqual([0.4, 0.3, 0.3]);
  });
});
