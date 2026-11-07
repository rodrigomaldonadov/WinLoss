-- CreateEnum
CREATE TYPE "ModelVersionState" AS ENUM ('CHAMPION', 'CHALLENGER', 'RETIRED');

-- AlterTable
ALTER TABLE "AnalysisSnapshot" ADD COLUMN     "challengerBrier" DECIMAL(12,6),
ADD COLUMN     "challengerLogLoss" DECIMAL(12,6),
ADD COLUMN     "challengerProbability" JSONB,
ADD COLUMN     "challengerVersionId" TEXT;

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "ModelVersionState" NOT NULL DEFAULT 'CHALLENGER',
    "params" JSONB NOT NULL,
    "metrics" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "previousVersionId" TEXT,

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelVersion_state_createdAt_idx" ON "ModelVersion"("state", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisSnapshot_challengerVersionId_idx" ON "AnalysisSnapshot"("challengerVersionId");
