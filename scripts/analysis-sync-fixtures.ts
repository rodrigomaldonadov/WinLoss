/**
 * Sincroniza próximos partidos desde las APIs deportivas. No descarga cuotas:
 * las cuotas de mercado solo entran por el CSV semanal de fixtures.
 *
 *   npm run analysis:sync
 */

import { PrismaClient } from "@prisma/client";

import { loadEnv } from "../src/lib/analysis/api";
import { runSyncJob } from "../src/lib/analysis/jobs/sync-job";

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  try {
    const summary = await runSyncJob({ prisma, logger: console.log });
    if (!summary.ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
