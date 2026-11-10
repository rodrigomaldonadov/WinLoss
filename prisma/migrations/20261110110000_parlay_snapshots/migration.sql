-- Movimiento de cuotas de la sección Investigar (ParlayAPI).
CREATE TABLE "ParlayOddsSnapshot" (
  "id" TEXT NOT NULL,
  "sportKey" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "market" TEXT NOT NULL DEFAULT 'h2h',
  "outcome" TEXT NOT NULL,
  "bookmaker" TEXT NOT NULL,
  "price" DECIMAL(8, 3) NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParlayOddsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParlayOddsSnapshot_eventId_market_capturedAt_idx"
  ON "ParlayOddsSnapshot"("eventId", "market", "capturedAt");
CREATE INDEX "ParlayOddsSnapshot_capturedAt_idx"
  ON "ParlayOddsSnapshot"("capturedAt");
