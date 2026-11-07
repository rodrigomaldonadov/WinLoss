-- CreateTable
CREATE TABLE "AnalysisImportFile" (
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mtime" TIMESTAMP(3) NOT NULL,
    "hash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisImportFile_pkey" PRIMARY KEY ("path")
);

-- CreateTable
CREATE TABLE "AnalysisRefreshLock" (
    "key" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisRefreshLock_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AnalysisRefreshRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "steps" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRefreshRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisImportFile_kind_processedAt_idx" ON "AnalysisImportFile"("kind", "processedAt");

-- CreateIndex
CREATE INDEX "AnalysisRefreshLock_expiresAt_idx" ON "AnalysisRefreshLock"("expiresAt");

-- CreateIndex
CREATE INDEX "AnalysisRefreshRun_startedAt_idx" ON "AnalysisRefreshRun"("startedAt");
