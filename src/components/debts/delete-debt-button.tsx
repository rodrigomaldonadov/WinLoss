"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { deleteDebt } from "@/lib/actions/debt";

type DeleteDebtButtonProps = {
  debtId: string;
  disabled?: boolean;
};

export function DeleteDebtButton({
  debtId,
  disabled,
}: DeleteDebtButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const result = await deleteDebt(debtId);
      if (!result.ok) {
        toast.error(result.error ?? "No pudimos eliminar la deuda.");
        return;
      }
      toast.success("Deuda eliminada");
      router.push("/debts");
      router.refresh();
    });
  };

  if (disabled) {
    return (
      <p className="text-[0.6875rem] text-muted-foreground">
        No se puede eliminar una deuda con pagos registrados.
      </p>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 gap-1 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" aria-hidden />
        Eliminar
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta deuda?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la deuda y, si el préstamo entró al bankroll, también
              su movimiento de entrada. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={confirm}
              disabled={pending}
            >
              {pending ? "Eliminando…" : "Eliminar deuda"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
