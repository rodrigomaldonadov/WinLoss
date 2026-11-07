-- AlterTable
ALTER TABLE "AnalysisSnapshot" ADD COLUMN     "communityAvailable" BOOLEAN,
ADD COLUMN     "communityProbability" JSONB,
ADD COLUMN     "communitySample" INTEGER,
ADD COLUMN     "topScores" JSONB;

-- CreateTable
CREATE TABLE "MatchReviewCache" (
    "id" TEXT NOT NULL,
    "historicalMatchId" TEXT NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "probabilities" JSONB NOT NULL,
    "ratingsAsOf" TIMESTAMP(3) NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchReviewCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingAsOfCache" (
    "id" TEXT NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "modelVersionId" TEXT NOT NULL,
    "ratings" JSONB NOT NULL,
    "matchesUsed" INTEGER NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingAsOfCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchReviewCache_modelVersionId_calculatedAt_idx" ON "MatchReviewCache"("modelVersionId", "calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchReviewCache_historicalMatchId_modelVersionId_key" ON "MatchReviewCache"("historicalMatchId", "modelVersionId");

-- CreateIndex
CREATE INDEX "RatingAsOfCache_modelVersionId_calculatedAt_idx" ON "RatingAsOfCache"("modelVersionId", "calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RatingAsOfCache_competitionCode_weekStart_modelVersionId_key" ON "RatingAsOfCache"("competitionCode", "weekStart", "modelVersionId");
