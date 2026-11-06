-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LegMarketKey" ADD VALUE 'ASIAN_HANDICAP';
ALTER TYPE "LegMarketKey" ADD VALUE 'TEAM_TOTAL_GOALS';
ALTER TYPE "LegMarketKey" ADD VALUE 'ODD_EVEN';
ALTER TYPE "LegMarketKey" ADD VALUE 'WIN_TO_NIL';
ALTER TYPE "LegMarketKey" ADD VALUE 'EXACT_TOTAL_GOALS';
