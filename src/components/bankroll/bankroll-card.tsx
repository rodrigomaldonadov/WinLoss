"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BankrollFormSheet } from "@/components/bankroll/bankroll-form-sheet";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deleteBankroll,
  type DeleteBankrollState,
} from "@/lib/actions/bankroll";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { BankrollSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const initialDeleteState: DeleteBankrollState = {};

type BankrollCardProps = {
  bankroll: BankrollSummary;
};

export function BankrollCard({ bankroll }: BankrollCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteBankroll,
    initialDeleteState,
  );

  useEffect(() => {
    if (deleteState.ok) {
      setDeleteOpen(false);
      toast.success("Bankroll eliminado");
    }
    if (deleteState.error) {
      toast.error(deleteState.error);
    }
  }, [deleteState]);

  const profitTone =
    bankroll.profit > 0
      ? "text-success"
      : bankroll.profit < 0
        ? "text-loss"
        : "text-muted-foreground";

  return (
    <>
      <article className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{bankroll.name}</h2>
              <Badge variant="secondary" className="font-normal">
                {bankroll.currency}
              </Badge>
              {!bankroll.isActive && (
                <Badge variant="outline" className="font-normal">
                  Archivado
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {bankroll.pendingCount > 0
                ? `${bankroll.pendingCount} apuesta${bankroll.pendingCount === 1 ? "" : "s"} pendiente${bankroll.pendingCount === 1 ? "" : "s"}`
                : "Sin apuestas pendientes"}
            </p>
          </div>

          <div className="-mr-2 -mt-2 flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Editar ${bankroll.name}`}
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Eliminar ${bankroll.name}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(bankroll.currentBankroll, bankroll.currency)}
        </p>
        <p className={cn("mt-0.5 text-xs font-medium", profitTone)}>
          {formatCurrency(bankroll.profit, bankroll.currency)} de beneficio ·{" "}
          {formatPercent(bankroll.roi, { signed: true })} ROI
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
          <div>
            <dt className="text-[11px] text-muted-foreground">Inicial</dt>
            <dd className="mt-0.5 text-xs font-medium tabular-nums">
              {formatCurrency(bankroll.initialAmount, bankroll.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Pendiente</dt>
            <dd className="mt-0.5 text-xs font-medium tabular-nums">
              {formatCurrency(bankroll.pendingStake, bankroll.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">Apuestas</dt>
            <dd className="mt-0.5 text-xs font-medium tabular-nums">
              {bankroll.settledCount + bankroll.pendingCount}
            </dd>
          </div>
        </dl>
      </article>

      <BankrollFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        bankroll={bankroll}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar “{bankroll.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si el bankroll tiene apuestas,
              conservaremos el historial y no permitiremos eliminarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={bankroll.id} />
              <Button
                type="submit"
                variant="destructive"
                className="w-full sm:w-auto"
                disabled={deleting}
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </Button>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
