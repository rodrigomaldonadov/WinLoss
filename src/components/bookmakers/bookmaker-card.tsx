"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BookmakerFormSheet } from "@/components/bookmakers/bookmaker-form-sheet";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  deleteBookmaker,
  type DeleteBookmakerState,
} from "@/lib/actions/bookmaker";
import type { BookmakerSummary } from "@/lib/data/bookmakers";

const initialDeleteState: DeleteBookmakerState = {};

type BookmakerCardProps = {
  bookmaker: BookmakerSummary;
};

export function BookmakerCard({ bookmaker }: BookmakerCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteBookmaker,
    initialDeleteState,
  );

  useEffect(() => {
    if (deleteState.ok) toast.success("Casa de apuestas eliminada");
    if (deleteState.error) toast.error(deleteState.error);
  }, [deleteState]);

  const dialogOpen = deleteOpen && !deleteState.ok;

  return (
    <>
      <li className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
          {bookmaker.name.slice(0, 2).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{bookmaker.name}</p>
          <p className="text-xs text-muted-foreground">
            {bookmaker.betCount === 0
              ? "Sin apuestas"
              : `${bookmaker.betCount} apuesta${bookmaker.betCount === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="-mr-2 flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Editar ${bookmaker.name}`}
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Eliminar ${bookmaker.name}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </li>

      <BookmakerFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        bookmaker={bookmaker}
      />

      <AlertDialog open={dialogOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar “{bookmaker.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Las apuestas registradas se conservarán, pero perderán la
              referencia a esta casa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={bookmaker.id} />
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
