-- CreateEnum
CREATE TYPE "AnalysisConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "favoriteCompetitions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "favoriteTeams" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "shareAnonymousStats" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamAlias" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,

    CONSTRAINT "TeamAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalMatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "competitionCode" TEXT,
    "season" TEXT NOT NULL,
    "seasonStart" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "homeGoals" INTEGER NOT NULL,
    "awayGoals" INTEGER NOT NULL,
    "result" TEXT,
    "odds" JSONB,
    "stats" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamRating" (
    "id" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "competitionCode" TEXT,
    "teamId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "attack" DECIMAL(12,6) NOT NULL,
    "defense" DECIMAL(12,6) NOT NULL,
    "homeAdvantage" DECIMAL(12,6),
    "leagueAvgHomeGoals" DECIMAL(12,6),
    "leagueAvgAwayGoals" DECIMAL(12,6),
    "sampleMatches" INTEGER NOT NULL,
    "params" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchAnalysis" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "competitionCode" TEXT,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "homeName" TEXT NOT NULL,
    "awayName" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "probabilities" JSONB NOT NULL,
    "confidence" "AnalysisConfidence" NOT NULL,
    "metadata" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelEvaluation" (
    "id" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "sample" INTEGER NOT NULL,
    "brier" DECIMAL(12,6),
    "logLoss" DECIMAL(12,6),
    "baselineBrier" DECIMAL(12,6),
    "baselineLogLoss" DECIMAL(12,6),
    "calibration" JSONB,
    "params" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixtureBatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "FixtureBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpcomingFixture" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "competitionCode" TEXT,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "homeName" TEXT NOT NULL,
    "awayName" TEXT NOT NULL,
    "odds" JSONB,
    "oddsCapturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpcomingFixture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_normalizedName_key" ON "Team"("normalizedName");

-- CreateIndex
CREATE INDEX "Team_canonicalName_idx" ON "Team"("canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "TeamAlias_normalized_key" ON "TeamAlias"("normalized");

-- CreateIndex
CREATE INDEX "TeamAlias_teamId_idx" ON "TeamAlias"("teamId");

-- CreateIndex
CREATE INDEX "HistoricalMatch_competition_playedAt_idx" ON "HistoricalMatch"("competition", "playedAt");

-- CreateIndex
CREATE INDEX "HistoricalMatch_homeTeamId_playedAt_idx" ON "HistoricalMatch"("homeTeamId", "playedAt");

-- CreateIndex
CREATE INDEX "HistoricalMatch_awayTeamId_playedAt_idx" ON "HistoricalMatch"("awayTeamId", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalMatch_competition_season_playedAt_homeTeamId_away_key" ON "HistoricalMatch"("competition", "season", "playedAt", "homeTeamId", "awayTeamId");

-- CreateIndex
CREATE INDEX "TeamRating_competition_asOf_idx" ON "TeamRating"("competition", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRating_competition_teamId_asOf_key" ON "TeamRating"("competition", "teamId", "asOf");

-- CreateIndex
CREATE INDEX "MatchAnalysis_kickoff_idx" ON "MatchAnalysis"("kickoff");

-- CreateIndex
CREATE INDEX "MatchAnalysis_competition_kickoff_idx" ON "MatchAnalysis"("competition", "kickoff");

-- CreateIndex
CREATE UNIQUE INDEX "MatchAnalysis_source_externalEventId_key" ON "MatchAnalysis"("source", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelEvaluation_competition_model_asOf_key" ON "ModelEvaluation"("competition", "model", "asOf");

-- CreateIndex
CREATE INDEX "FixtureBatch_source_capturedAt_idx" ON "FixtureBatch"("source", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UpcomingFixture_sourceKey_key" ON "UpcomingFixture"("sourceKey");

-- CreateIndex
CREATE INDEX "UpcomingFixture_kickoff_idx" ON "UpcomingFixture"("kickoff");

-- CreateIndex
CREATE INDEX "UpcomingFixture_competition_kickoff_idx" ON "UpcomingFixture"("competition", "kickoff");

-- AddForeignKey
ALTER TABLE "TeamAlias" ADD CONSTRAINT "TeamAlias_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalMatch" ADD CONSTRAINT "HistoricalMatch_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalMatch" ADD CONSTRAINT "HistoricalMatch_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRating" ADD CONSTRAINT "TeamRating_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAnalysis" ADD CONSTRAINT "MatchAnalysis_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAnalysis" ADD CONSTRAINT "MatchAnalysis_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpcomingFixture" ADD CONSTRAINT "UpcomingFixture_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FixtureBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpcomingFixture" ADD CONSTRAINT "UpcomingFixture_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpcomingFixture" ADD CONSTRAINT "UpcomingFixture_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
