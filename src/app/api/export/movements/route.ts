import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getBankrollMovements } from "@/lib/data/debts";
import { csvResponse, toCsvRow } from "@/lib/csv";

const HEADERS = [
  "fecha",
  "tipo",
  "bankroll",
  "moneda_original",
  "monto_original",
  "tasa",
  "monto_convertido",
  "moneda_bankroll",
  "deuda",
  "nota",
];

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const movements = await getBankrollMovements(session.user.id);
  const rows = [HEADERS.join(",")];

  for (const movement of movements) {
    rows.push(
      toCsvRow([
        movement.occurredAt.toISOString(),
        movement.type,
        movement.bankrollName,
        movement.currency,
        movement.amount.toFixed(2),
        movement.exchangeRate ?? "",
        movement.amountInBankrollCurrency.toFixed(2),
        movement.bankrollCurrency,
        movement.lenderName ?? "",
        movement.note ?? "",
      ]),
    );
  }

  return csvResponse(rows, "winloss-movimientos");
}
