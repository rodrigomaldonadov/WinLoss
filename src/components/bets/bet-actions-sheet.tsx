"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Ellipsis,
  Pencil,
  Trash2,
} from "lucide-react";
import type { BetStatus } from "@prisma/client";
import { toast } from "sonner";

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { deleteBet, type DeleteBetState } from "@/lib/actions/bet";
import { getBetStatusMeta } from "@/lib/bet-status";
import { formatCurrency, formatOdds } from "@/lib/format";

const initialState: DeleteBetState = {};

type BetActionsSheetProps = {
  bet: {
    id: string;
    eventName: string;
    status: BetStatus;
    stake: number;
    odds: number;
    isFreeBet: boolean;
    bankroll: { currency: string };
  };
};

export function BetActionsSheet({ bet }: BetActionsSheetProps) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [state, deleteAction, deleting] = useActionState(
    deleteBet,
    initialState,
  );

  useEffect(() => {
    if (state.ok) toast.success("Apuesta eliminada");
    if (state.error) toast.error(state.error);
  }, [state]);

  const status = getBetStatusMeta(bet.status);
  const sheetOpen = open && !state.ok;
  const dialogOpen = deleteOpen && !state.ok;

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label={`Opciones de ${bet.eventName}`}
          >
            <Ellipsis className="size-5" aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-lg"
        >
          <SheetHeader className="pb-0">
            <div className="flex items-center justify-between gap-3 pr-8">
              <SheetTitle className="min-w-0 truncate">
                {bet.eventName}
              </SheetTitle>
              <Badge className={status.badgeClassName}>{status.label}</Badge>
            </div>
            <SheetDescription>
              {formatOdds(bet.odds)} ·{" "}
              {formatCurrency(bet.stake, bet.bankroll.currency)}
              {bet.isFreeBet ? " · Free bet" : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-2 px-4">
            <Link
              href={`/bets/new?copy=${bet.id}`}
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors active:bg-muted/60"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Copy className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Duplicar</span>
                <span className="block text-xs text-muted-foreground">
                  Mismo pick con un stake nuevo.
                </span>
              </span>
            </Link>

            <Link
              href={`/bets/${bet.id}/edit`}
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors active:bg-muted/60"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Pencil className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Editar</span>
                <span className="block text-xs text-muted-foreground">
                  Corrige cuota, stake o datos del evento.
                </span>
              </span>
            </Link>

            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg border border-destructive/20 p-3 text-left transition-colors active:bg-destructive/10"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Trash2 className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-destructive">
                  Eliminar
                </span>
                <span className="block text-xs text-muted-foreground">
                  Libera el stake y recalcula tus métricas.
                </span>
              </span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={dialogOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta apuesta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{bet.eventName}</strong> de forma
              permanente. El bankroll, el beneficio y el ROI se recalcularán al
              instante para mantener los saldos consistentes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={bet.id} />
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
