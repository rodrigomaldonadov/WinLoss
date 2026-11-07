import type { Prisma } from "@prisma/client";

import type { AnalysisResult } from "@/lib/analysis/engine";
import type { ModelMarkets, TopScore } from "@/lib/analysis/review/markets";

export type SnapshotTopScore = TopScore;


export function shouldSnapshot(kickoff: Date, now: Date): boolean {
  return kickoff.getTime() > now.getTime();
}

export function hasSnapshotData(
  final: AnalysisResult["final"],
  sources: AnalysisResult["sources"],
): boolean {
  return Boolean(
    final.probabilities ||
      sources.market.probabilities ||
      sources.model.probabilities,
  );
}

export type SnapshotInput = {
  matchKey: string;
  externalEventId: string;
  competition: string;
  competitionCode: string | null;
  kickoff: Date;
  homeName: string;
  awayName: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  final: AnalysisResult["final"];
  sources: AnalysisResult["sources"];
  ratingsVersion: string | null;
  ratingsParams: Record<string, unknown> | null;
  marketCapturedAt: Date | null;
  marketFresh: boolean;
  snapshotAt: Date;
  challengerProbability?: [number, number, number] | null;
  challengerVersionId?: string | null;
  communityProbability?: { home: number; draw: number; away: number } | null;
  communitySample?: number | null;
  communityAvailable?: boolean;
  topScores?: SnapshotTopScore[] | null;
  markets?: ModelMarkets | null;
};

export function buildSnapshotRecord(
  input: SnapshotInput,
): Prisma.AnalysisSnapshotCreateManyInput {
  return {
    matchKey: input.matchKey,
    externalEventId: input.externalEventId,
    competition: input.competition,
    competitionCode: input.competitionCode,
    kickoff: input.kickoff,
    snapshotAt: input.snapshotAt,
    homeName: input.homeName,
    awayName: input.awayName,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    confidence: input.final.confidence,
    finalSource: input.final.source,
    marketProbability:
      (input.sources.market.probabilities as unknown as
        | Prisma.InputJsonValue
        | null) ?? undefined,
    modelProbability:
      (input.sources.model.probabilities as unknown as
        | Prisma.InputJsonValue
        | null) ?? undefined,
    finalProbability:
      (input.final.probabilities as unknown as Prisma.InputJsonValue | null) ??
      undefined,
    ratingsVersion: input.ratingsVersion,
    ratingsParams:
      (input.ratingsParams as unknown as Prisma.InputJsonValue | null) ??
      undefined,
    marketCapturedAt: input.marketCapturedAt,
    marketFresh: input.marketFresh,
    challengerProbability:
      (input.challengerProbability as unknown as
        | Prisma.InputJsonValue
        | null) ?? undefined,
    challengerVersionId: input.challengerVersionId ?? null,
    communityProbability:
      (input.communityProbability as unknown as
        | Prisma.InputJsonValue
        | null) ?? undefined,
    communitySample: input.communitySample ?? null,
    communityAvailable: input.communityAvailable ?? false,
    topScores:
      (input.topScores as unknown as Prisma.InputJsonValue | null) ??
      undefined,
    markets:
      (input.markets as unknown as Prisma.InputJsonValue | null) ?? undefined,
  };
}
