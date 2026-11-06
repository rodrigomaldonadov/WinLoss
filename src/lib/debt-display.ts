import type { DebtStatus } from "@prisma/client";

export type DebtStatusMeta = {
  label: string;
  className: string;
};

/** Chip visual para el estado derivado de una deuda. */
export function getDebtStatusMeta(
  status: DebtStatus,
  isOverdue = false,
): DebtStatusMeta {
  if (isOverdue) {
    return {
      label: "Vencida",
      className:
        "border-destructive/30 bg-destructive/10 text-destructive",
    };
  }

  switch (status) {
    case "PAID":
      return {
        label: "Pagada",
        className: "border-success/30 bg-success/10 text-success",
      };
    case "PARTIAL":
      return {
        label: "Parcial",
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "OPEN":
    default:
      return {
        label: "Abierta",
        className: "border-primary/30 bg-primary/10 text-primary",
      };
  }
}
