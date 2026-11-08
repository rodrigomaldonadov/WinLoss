-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "buyRate" DECIMAL(12,6) NOT NULL,
    "sellRate" DECIMAL(12,6) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_userId_effectiveAt_idx" ON "ExchangeRate"("userId", "effectiveAt");

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Debt" ADD COLUMN "exchangeRate" DECIMAL(12,6),
ADD COLUMN "rateKind" TEXT,
ADD COLUMN "rateLabel" TEXT;

-- AlterTable
ALTER TABLE "DebtPayment" ADD COLUMN "rateKind" TEXT,
ADD COLUMN "rateLabel" TEXT;
