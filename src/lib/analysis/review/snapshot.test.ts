import { describe, expect, it } from "vitest";

import { selectLatestSnapshot, snapshotCommunity } from "./snapshot";

describe("selectLatestSnapshot", () => {
  it("elige la captura más reciente anterior al inicio", () => {
    const kickoff = new Date("2026-11-11T20:00:00.000Z");
    const chosen = selectLatestSnapshot([
      { id: "after", snapshotAt: new Date("2026-11-11T21:00:00.000Z"), kickoff },
      { id: "old", snapshotAt: new Date("2026-11-10T10:00:00.000Z"), kickoff },
      { id: "latest", snapshotAt: new Date("2026-11-11T18:00:00.000Z"), kickoff },
    ]);
    expect(chosen?.id).toBe("latest");
  });

  it("devuelve null si todas son posteriores", () => {
    expect(
      selectLatestSnapshot([
        {
          snapshotAt: new Date("2026-11-11T21:00:00.000Z"),
          kickoff: new Date("2026-11-11T20:00:00.000Z"),
        },
      ]),
    ).toBeNull();
  });
});

describe("snapshotCommunity", () => {
  it("no expone comunidad con menos de 5 usuarios", () => {
    expect(
      snapshotCommunity({
        available: true,
        sample: 4,
        probabilities: { home: 0.5, draw: 0.3, away: 0.2 },
      }),
    ).toBeNull();
  });

  it("expone comunidad con 5 o más y snapshot disponible", () => {
    expect(
      snapshotCommunity({
        available: true,
        sample: 5,
        probabilities: { home: 0.5, draw: 0.3, away: 0.2 },
      }),
    ).toMatchObject({ available: true, sample: 5 });
  });
});
