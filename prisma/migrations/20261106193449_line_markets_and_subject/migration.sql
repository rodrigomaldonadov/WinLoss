-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LegMarketKey" ADD VALUE 'TOTAL_CORNERS';
ALTER TYPE "LegMarketKey" ADD VALUE 'TOTAL_CARDS';
ALTER TYPE "LegMarketKey" ADD VALUE 'GENERIC_LINE';

-- AlterTable
ALTER TABLE "LegSelection" ADD COLUMN     "subject" TEXT;
