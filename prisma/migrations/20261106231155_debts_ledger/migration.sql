-- CreateEnum
CREATE TYPE "DebtCurrency" AS ENUM ('PEN', 'USD');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "DebtPaymentSource" AS ENUM ('FROM_BANKROLL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "BankrollTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'LOAN_IN', 'LOAN_REPAYMENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "debtAlertThresholdPct" DECIMAL(5,2) NOT NULL DEFAULT 30,
ADD COLUMN     "showDebts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "usdToPenRate" DECIMAL(12,6);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankrollId" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL,
    "currency" "DebtCurrency" NOT NULL,
    "borrowedAt" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "interestRateMonthly" DECIMAL(12,6),
    "status" "DebtStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "source" "DebtPaymentSource" NOT NULL,
    "exchangeRate" DECIMAL(12,6),
    "note" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankrollTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankrollId" TEXT NOT NULL,
    "type" "BankrollTransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "DebtCurrency" NOT NULL,
    "exchangeRate" DECIMAL(12,6),
    "amountInBankrollCurrency" DECIMAL(14,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "debtId" TEXT,
    "debtPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankrollTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Debt_userId_status_idx" ON "Debt"("userId", "status");

-- CreateIndex
CREATE INDEX "Debt_bankrollId_idx" ON "Debt"("bankrollId");

-- CreateIndex
CREATE INDEX "Debt_userId_dueDate_idx" ON "Debt"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "DebtPayment_debtId_paidAt_idx" ON "DebtPayment"("debtId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankrollTransaction_debtPaymentId_key" ON "BankrollTransaction"("debtPaymentId");

-- CreateIndex
CREATE INDEX "BankrollTransaction_userId_occurredAt_idx" ON "BankrollTransaction"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "BankrollTransaction_bankrollId_occurredAt_idx" ON "BankrollTransaction"("bankrollId", "occurredAt");

-- CreateIndex
CREATE INDEX "BankrollTransaction_debtId_idx" ON "BankrollTransaction"("debtId");

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_bankrollId_fkey" FOREIGN KEY ("bankrollId") REFERENCES "Bankroll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankrollTransaction" ADD CONSTRAINT "BankrollTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankrollTransaction" ADD CONSTRAINT "BankrollTransaction_bankrollId_fkey" FOREIGN KEY ("bankrollId") REFERENCES "Bankroll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankrollTransaction" ADD CONSTRAINT "BankrollTransaction_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankrollTransaction" ADD CONSTRAINT "BankrollTransaction_debtPaymentId_fkey" FOREIGN KEY ("debtPaymentId") REFERENCES "DebtPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
