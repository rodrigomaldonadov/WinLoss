-- Fase 1: nuevo modelo Bet -> BetLeg -> LegSelection.
-- Migración NO destructiva: conserva las columnas antiguas de "Bet" para
-- poder retirarlas en una tarea posterior.

-- CreateEnum
CREATE TYPE "LegStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'VOID', 'HALF_WON', 'HALF_LOST');

-- AlterTable: identificador externo del boleto y cuota total con más precisión.
ALTER TABLE "Bet"
  ADD COLUMN "externalId" TEXT,
  ALTER COLUMN "odds" SET DATA TYPE DECIMAL(10,3);

-- CreateTable
CREATE TABLE "BetLeg" (
    "id" TEXT NOT NULL,
    "betId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sport" TEXT NOT NULL,
    "competition" TEXT,
    "eventName" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "isBuilder" BOOLEAN NOT NULL DEFAULT false,
    "odds" DECIMAL(8,3) NOT NULL,
    "closingOdds" DECIMAL(8,3),
    "status" "LegStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "BetLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegSelection" (
    "id" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,

    CONSTRAINT "LegSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bet_userId_externalId_key" ON "Bet"("userId", "externalId");

-- CreateIndex
CREATE INDEX "BetLeg_betId_idx" ON "BetLeg"("betId");

-- CreateIndex
CREATE INDEX "LegSelection_legId_idx" ON "LegSelection"("legId");

-- AddForeignKey
ALTER TABLE "BetLeg" ADD CONSTRAINT "BetLeg_betId_fkey" FOREIGN KEY ("betId") REFERENCES "Bet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegSelection" ADD CONSTRAINT "LegSelection_legId_fkey" FOREIGN KEY ("legId") REFERENCES "BetLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada apuesta existente pasa a tener un leg y una selección.
-- Los estados de leg no incluyen CASHOUT; se conserva el estado CASHOUT en
-- "Bet.status" y el leg se marca como VOID para no alterar el historial.
INSERT INTO "BetLeg" (
    "id",
    "betId",
    "position",
    "sport",
    "competition",
    "eventName",
    "eventDate",
    "isBuilder",
    "odds",
    "closingOdds",
    "status"
)
SELECT
    'leg_' || b."id",
    b."id",
    0,
    b."sport",
    b."competition",
    b."eventName",
    NULL,
    false,
    b."odds",
    b."closingOdds",
    CASE b."status"::text
        WHEN 'PENDING' THEN 'PENDING'
        WHEN 'WON' THEN 'WON'
        WHEN 'LOST' THEN 'LOST'
        WHEN 'VOID' THEN 'VOID'
        WHEN 'HALF_WON' THEN 'HALF_WON'
        WHEN 'HALF_LOST' THEN 'HALF_LOST'
        ELSE 'VOID'
    END::"LegStatus"
FROM "Bet" b;

INSERT INTO "LegSelection" ("id", "legId", "position", "market", "selection")
SELECT
    'sel_' || b."id",
    'leg_' || b."id",
    0,
    b."market",
    b."selection"
FROM "Bet" b;
