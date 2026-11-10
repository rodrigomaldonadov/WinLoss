import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Healthcheck para el host: no expone detalles internos ni requiere sesión. */
export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`select 1`;
    return NextResponse.json(
      {
        ok: true,
        database: "up",
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[health] database:", error);
    return NextResponse.json(
      {
        ok: false,
        database: "down",
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
