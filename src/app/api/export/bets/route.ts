import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getBetTypeLabel } from "@/lib/bet-display";
import { prisma } from "@/lib/prisma";

const CSV_HEADERS = [
  "fecha",
  "tipo",
  "legs",
  "selecciones",
  "cuota",
  "stake",
  "moneda",
  "casa",
  "estado",
  "beneficio",
  "external_id",
];

function escapeCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values: unknown[]): string {
  return values.map(escapeCsvValue).join(",");
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const bets = await prisma.bet.findMany({
    where: { userId: session.user.id },
    orderBy: [{ placedAt: "desc" }, { createdAt: "desc" }],
    include: {
      bankroll: { select: { currency: true } },
      bookmaker: { select: { name: true } },
      legs: {
        orderBy: { position: "asc" },
        include: {
          selections: { orderBy: { position: "asc" } },
        },
      },
    },
  });

  const rows = [CSV_HEADERS.join(",")];
  for (const bet of bets) {
    const selectionsSummary = bet.legs
      .map((leg) => {
        const selections = leg.selections
          .map(
            (selection) => `${selection.market} - ${selection.selection}`,
          )
          .join(", ");
        return `${leg.eventName}: ${selections}`;
      })
      .join(" | ");

    rows.push(
      toCsvRow([
        bet.placedAt.toISOString(),
        getBetTypeLabel(bet),
        bet.legs.length,
        selectionsSummary,
        Number(bet.odds).toFixed(3),
        Number(bet.stake).toFixed(2),
        bet.bankroll?.currency ?? "",
        bet.bookmaker?.name ?? "",
        bet.status,
        bet.profit === null ? "" : bet.profit.toNumber().toFixed(2),
        bet.externalId ?? "",
      ]),
    );
  }

  const csv = `${rows.join("\r\n")}\r\n`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="winloss-apuestas-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
