import { NextResponse } from "next/server";

import { executeAnalysisRefresh } from "@/lib/analysis/jobs/refresh-runner";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  const header = request.headers.get("authorization") ?? "";
  const token =
    header.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret");
  return token === secret;
}

/**
 * Job único de /analysis: import incremental → sync de APIs → recálculo.
 * Protegido con CRON_SECRET. Si ya hay una corrida en curso devuelve SKIPPED.
 *
 * La ejecución es síncrona (unos 80 s por el throttle del sync). Para proxies
 * con timeout bajo, usa `npm run analysis:refresh` dentro del contenedor.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET no configurado" },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 },
    );
  }

  try {
    const { summary, logged } = await executeAnalysisRefresh({
      prisma,
      trigger: "cron",
      logger: (message) => console.log(message),
    });
    return NextResponse.json({
      ok: summary.status === "SUCCESS" || summary.status === "PARTIAL",
      logged,
      ...summary,
    });
  } catch (error) {
    console.error("[cron/analysis-refresh]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Error interno",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
