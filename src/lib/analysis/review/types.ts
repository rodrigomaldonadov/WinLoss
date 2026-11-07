import type { TopScore } from "./markets";

export type ReviewMode = "saved" | "reconstructed";
export type ReviewOutcome = "HOME" | "DRAW" | "AWAY";
export type ReviewSource = "marketPre" | "marketClose" | "model" | "final";

export type ProbabilitySet = Record<ReviewSource, number | null>;

export type ReviewMarketRow = {
  key: string;
  market: string;
  selection: string;
  actual: boolean;
  probabilities: ProbabilitySet;
};

export type ReviewScore = {
  source: ReviewSource;
  label: string;
  brier: number | null;
  logLoss: number | null;
};

export type ReviewCalibration = {
  probability: number;
  observed: number;
  sample: number;
  bin: string;
} | null;

export type ReviewPrivateSelection = {
  market: string;
  selection: string;
  line: number | null;
  pick: string | null;
};

export type ReviewPrivateLeg = {
  id: string;
  eventName: string;
  eventDate: Date | null;
  odds: number;
  status: string;
  selections: ReviewPrivateSelection[];
  fairOdds: number | null;
};

export type ReviewCommunity = {
  available: boolean;
  sample: number;
  probabilities: { home: number; draw: number; away: number } | null;
};

export type ReviewModelMarkets = {
  home: number | null;
  draw: number | null;
  away: number | null;
  over15: number | null;
  over25: number | null;
  over35: number | null;
  btts: number | null;
};

export type ReviewResult = {
  mode: ReviewMode;
  warning: string | null;
  matchId: string;
  matchKey: string;
  competition: string;
  competitionCode: string | null;
  kickoff: Date;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  actualOutcome: ReviewOutcome;
  actualTotal: number;
  btts: boolean;
  rows: ReviewMarketRow[];
  scores: ReviewScore[];
  closestSource: ReviewSource | null;
  topScores: TopScore[] | null;
  actualScoreInTop5: boolean | null;
  calibration: ReviewCalibration;
  community: ReviewCommunity | null;
  privateLegs: ReviewPrivateLeg[];
  modelMarkets: ReviewModelMarkets | null;
  ratingsVersion: string | null;
  ratingsAsOf: string | null;
  cacheHit: boolean;
  calculatedAt: Date;
};
