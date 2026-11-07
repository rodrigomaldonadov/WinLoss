import type { ReviewCommunity } from "./types";

export type SnapshotCandidate = {
  snapshotAt: Date;
  kickoff: Date;
};

/** La captura válida más reciente anterior al inicio del partido. */
export function selectLatestSnapshot<T extends SnapshotCandidate>(
  snapshots: readonly T[],
): T | null {
  return (
    snapshots
      .filter(
        (snapshot) => snapshot.snapshotAt.getTime() < snapshot.kickoff.getTime(),
      )
      .sort(
        (left, right) =>
          right.snapshotAt.getTime() - left.snapshotAt.getTime(),
      )[0] ?? null
  );
}

export function snapshotCommunity({
  available,
  sample,
  probabilities,
}: {
  available: boolean | null;
  sample: number | null;
  probabilities: unknown;
}): ReviewCommunity | null {
  if (!available || sample === null || sample < 5) return null;
  if (!probabilities || typeof probabilities !== "object") return null;
  const record = probabilities as Record<string, unknown>;
  if (
    typeof record.home !== "number" ||
    typeof record.draw !== "number" ||
    typeof record.away !== "number"
  ) {
    return null;
  }
  return {
    available: true,
    sample,
    probabilities: {
      home: record.home,
      draw: record.draw,
      away: record.away,
    },
  };
}
