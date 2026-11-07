/**
 * Recalcula ratings (máximo una vez por semana) y MatchAnalysis para los
 * próximos partidos. Requiere históricos importados y fixtures sincronizados.
 *
 *   npm run analysis:generate
 */

import { PrismaClient } from "@prisma/client";

import { loadEnv } from "../src/lib/analysis/api";
import { runGenerateJob } from "../src/lib/analysis/jobs/generate-job";

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  try {
    const summary = await runGenerateJob({ prisma, logger: console.log });
    if (!summary.ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
