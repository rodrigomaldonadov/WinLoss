/**
 * Importa CSV locales de data-football/. Es idempotente y solo procesa
 * archivos nuevos o modificados. Uso manual o desde el cron:
 *
 *   npm run analysis:import
 *   npm run analysis:import -- ./otra-carpeta
 */

import { PrismaClient } from "@prisma/client";

import { loadEnv } from "../src/lib/analysis/api";
import { runImportJob } from "../src/lib/analysis/jobs/import-job";

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dataDir = args.find((arg) => !arg.startsWith("--"));
  try {
    const summary = await runImportJob({
      prisma,
      dataDir: dataDir ?? process.env.ANALYSIS_DATA_DIR ?? "data-football",
      force,
      logger: console.log,
    });
    if (!summary.ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
