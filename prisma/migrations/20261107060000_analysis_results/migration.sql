-- AlterTable
ALTER TABLE "HistoricalMatch" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "provisional" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ResultDiscrepancy" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "csvHomeGoals" INTEGER NOT NULL,
    "csvAwayGoals" INTEGER NOT NULL,
    "apiHomeGoals" INTEGER NOT NULL,
    "apiAwayGoals" INTEGER NOT NULL,
    "apiSource" TEXT NOT NULL,
    "resolvedBy" TEXT NOT NULL DEFAULT 'csv',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResultDiscrepancy_dedupeKey_idx" ON "ResultDiscrepancy"("dedupeKey");

-- CreateIndex
CREATE INDEX "ResultDiscrepancy_competition_playedAt_idx" ON "ResultDiscrepancy"("competition", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalMatch_dedupeKey_key" ON "HistoricalMatch"("dedupeKey");
