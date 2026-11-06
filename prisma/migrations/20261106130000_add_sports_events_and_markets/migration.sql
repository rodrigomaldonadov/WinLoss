-- CreateEnum
CREATE TYPE "LegMarketKey" AS ENUM ('CUSTOM', 'MATCH_RESULT', 'DOUBLE_CHANCE', 'DRAW_NO_BET', 'TOTAL_GOALS', 'BTTS');

-- CreateEnum
CREATE TYPE "AutoSettleMode" AS ENUM ('SUGGEST', 'AUTO');

-- AlterTable
ALTER TABLE "BetLeg" ADD COLUMN     "autoSettled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "awayTeam" TEXT,
ADD COLUMN     "externalEventId" TEXT,
ADD COLUMN     "externalProvider" TEXT,
ADD COLUMN     "homeTeam" TEXT,
ADD COLUMN     "scoreAway" INTEGER,
ADD COLUMN     "scoreHome" INTEGER;

-- AlterTable
ALTER TABLE "LegSelection" ADD COLUMN     "line" DECIMAL(6,2),
ADD COLUMN     "marketKey" "LegMarketKey" NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN     "pick" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "autoSettleMode" "AutoSettleMode" NOT NULL DEFAULT 'SUGGEST';

-- CreateIndex
CREATE INDEX "BetLeg_externalProvider_externalEventId_idx" ON "BetLeg"("externalProvider", "externalEventId");
