-- CreateTable
CREATE TABLE "AnalysisSnapshot" (
    "id" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "competitionCode" TEXT,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL,
    "homeName" TEXT NOT NULL,
    "awayName" TEXT NOT NULL,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "confidence" "AnalysisConfidence" NOT NULL,
    "finalSource" TEXT NOT NULL,
    "marketProbability" JSONB,
    "modelProbability" JSONB,
    "finalProbability" JSONB,
    "ratingsVersion" TEXT,
    "ratingsParams" JSONB,
    "marketCapturedAt" TIMESTAMP(3),
    "marketFresh" BOOLEAN,
    "evaluatedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "result" TEXT,
    "outcome" INTEGER,
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "resultSource" TEXT,
    "marketBrier" DECIMAL(12,6),
    "marketLogLoss" DECIMAL(12,6),
    "modelBrier" DECIMAL(12,6),
    "modelLogLoss" DECIMAL(12,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisSnapshot_kickoff_idx" ON "AnalysisSnapshot"("kickoff");

-- CreateIndex
CREATE INDEX "AnalysisSnapshot_evaluatedAt_idx" ON "AnalysisSnapshot"("evaluatedAt");

-- CreateIndex
CREATE INDEX "AnalysisSnapshot_competition_evaluatedAt_idx" ON "AnalysisSnapshot"("competition", "evaluatedAt");

-- CreateIndex
CREATE INDEX "AnalysisSnapshot_matchKey_kickoff_idx" ON "AnalysisSnapshot"("matchKey", "kickoff");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisSnapshot_matchKey_snapshotAt_key" ON "AnalysisSnapshot"("matchKey", "snapshotAt");
