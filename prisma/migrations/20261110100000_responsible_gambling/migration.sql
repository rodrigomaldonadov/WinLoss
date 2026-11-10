-- Juego responsable: límite semanal de stake y autoexclusión temporal.
ALTER TABLE "User"
  ADD COLUMN "weeklyStakeLimit" DECIMAL(12, 2),
  ADD COLUMN "selfExclusionUntil" TIMESTAMP(3);
