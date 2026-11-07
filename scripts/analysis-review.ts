/**
 * Evalúa snapshots pendientes y compara el forward test con el backtest.
 * Solo reporta: no modifica pesos, temperaturas ni versiones.
 *
 *   npm run analysis:review
 */

import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import { loadEnv } from "../src/lib/analysis/api";
import {
  mapSnapshotToForward,
  reviewForwardTest,
  summarizeForward,
  type BacktestReference,
} from "../src/lib/analysis/forward";
import { runEvaluationJob } from "../src/lib/analysis/jobs/evaluate-job";

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function number(value: number | null, digits = 4): string {
  return value === null ? "—" : value.toFixed(digits);
}

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  try {
    const evaluation = await runEvaluationJob({
      prisma,
      logger: console.log,
    });

    const snapshots = await prisma.analysisSnapshot.findMany({
      where: { evaluatedAt: { not: null } },
      select: {
        competition: true,
        competitionCode: true,
        outcome: true,
        modelProbability: true,
        marketProbability: true,
        modelBrier: true,
        marketBrier: true,
        modelLogLoss: true,
        marketLogLoss: true,
        snapshotAt: true,
      },
      orderBy: { snapshotAt: "asc" },
    });

    const rows = snapshots.flatMap((snapshot) => {
      const mapped = mapSnapshotToForward({
        ...snapshot,
        modelBrier:
          snapshot.modelBrier === null ? null : Number(snapshot.modelBrier),
        marketBrier:
          snapshot.marketBrier === null ? null : Number(snapshot.marketBrier),
        modelLogLoss:
          snapshot.modelLogLoss === null
            ? null
            : Number(snapshot.modelLogLoss),
        marketLogLoss:
          snapshot.marketLogLoss === null
            ? null
            : Number(snapshot.marketLogLoss),
      });
      return mapped ? [mapped] : [];
    });
    const forward = summarizeForward(rows);

    const weights = JSON.parse(
      readFileSync("analysis-weights.json", "utf8"),
    ) as {
      global: { modelBrier: number; marketBrier: number };
      competitions: Record<
        string,
        { modelBrier: number; marketBrier: number }
      >;
    };
    const backtest: BacktestReference = {
      modelBrier: weights.global.modelBrier,
      marketBrier: weights.global.marketBrier,
      competitions: Object.fromEntries(
        Object.entries(weights.competitions).map(([competition, entry]) => [
          competition,
          {
            modelBrier: entry.modelBrier,
            marketBrier: entry.marketBrier,
          },
        ]),
      ),
    };
    const review = reviewForwardTest(forward, backtest, { rows });

    console.log("");
    console.log("Forward test · desde que está en uso");
    console.log(
      `Desde: ${forward.since ? forward.since.slice(0, 10) : "—"} · N=${forward.sample} · evaluados en esta corrida=${evaluation.evaluated}`,
    );
    console.log(
      `${pad("Ámbito", 28)} ${pad("N", 6)} ${pad("Brier modelo", 13)} ${pad("Brier mercado", 14)} ${pad("Δ modelo-mercado", 17)}`,
    );
    console.log(
      `${pad("TOTAL", 28)} ${pad(String(forward.sample), 6)} ${pad(number(forward.modelBrier), 13)} ${pad(number(forward.marketBrier), 14)} ${pad(number(forward.modelBrier !== null && forward.marketBrier !== null ? forward.modelBrier - forward.marketBrier : null), 17)}`,
    );
    for (const competition of forward.competitions) {
      console.log(
        `${pad(competition.competition, 28)} ${pad(String(competition.sample), 6)} ${pad(number(competition.modelBrier), 13)} ${pad(number(competition.marketBrier), 14)} ${pad(number(competition.modelBrier !== null && competition.marketBrier !== null ? competition.modelBrier - competition.marketBrier : null), 17)}`,
      );
    }

    console.log("");
    console.log(
      `Backtest de referencia: modelo ${backtest.modelBrier.toFixed(4)} · mercado ${backtest.marketBrier.toFixed(4)}`,
    );
    console.log(
      `Peso óptimo forward del modelo: ${review.optimalWeight === null ? "—" : review.optimalWeight.toFixed(2)} (producción: 0)`,
    );

    if (review.alerts.length > 0) {
      console.log("");
      console.log("Alertas:");
      for (const alert of review.alerts) console.log(`  - ${alert}`);
    }
    console.log("");
    console.log("Recomendaciones:");
    for (const recommendation of review.recommendations) {
      console.log(`  - ${recommendation}`);
    }
    console.log("");
    console.log(
      `Sin cambios automáticos. Deterioro=${review.deterioration ? "sí" : "no"} · peso cambiado=${review.weightChanged ? "sí" : "no"}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
