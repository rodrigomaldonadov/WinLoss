import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getDebtsForUser } from "@/lib/data/debts";
import { csvResponse, toCsvRow } from "@/lib/csv";

const HEADERS = [
  "acreedor",
  "moneda",
  "principal",
  "interes_mensual",
  "fecha_prestamo",
  "vencimiento",
  "estado",
  "saldo_pendiente",
  "interes_devengado",
  "pagado",
  "equivalente_pen",
  "bankroll",
  "notas",
];

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const { debts } = await getDebtsForUser(session.user.id);
  const rows = [HEADERS.join(",")];

  for (const debt of debts) {
    rows.push(
      toCsvRow([
        debt.lenderName,
        debt.currency,
        debt.principal.toFixed(2),
        debt.interestRateMonthly ?? "",
        debt.borrowedAt.toISOString(),
        debt.dueDate?.toISOString() ?? "",
        debt.isOverdue ? "VENCIDA" : debt.status,
        debt.balance.toFixed(2),
        debt.interest.toFixed(2),
        debt.paid.toFixed(2),
        debt.equivalentPen.toFixed(2),
        debt.bankrollName,
        debt.notes ?? "",
      ]),
    );
  }

  return csvResponse(rows, "winloss-deudas");
}
