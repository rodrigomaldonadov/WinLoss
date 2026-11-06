import { NextResponse } from "next/server";

import { runAutoSettlementForAllUsers } from "@/lib/auto-settle-runner";

export const dynamic = "force-dynamic";

/**
 * Cron de auto-liquidación.
 * Protegido con `CRON_SECRET` (header Authorization: Bearer <secret> o ?secret=).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET no configurado" },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret");

  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await runAutoSettlementForAllUsers();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/settle]", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
