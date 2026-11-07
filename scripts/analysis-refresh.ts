/**
 * Ejecuta el refresh completo dentro del contenedor, sin pasar por el proxy.
 * Usa el mismo lock y deja el mismo registro que /api/cron/analysis-refresh.
 *
 *   npm run analysis:refresh
 */

import { PrismaClient } from "@prisma/client";

import { loadEnv } from "../src/lib/analysis/api";
import { executeAnalysisRefresh } from "../src/lib/analysis/jobs/refresh-runner";

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  try {
    const { summary, logged } = await executeAnalysisRefresh({
      prisma,
      trigger: "cli",
      logger: console.log,
    });
    console.log(JSON.stringify({ logged, ...summary }, null, 2));
    if (summary.status === "FAILED") process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
