"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
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
import { voidPayment } from "@/lib/actions/debt";

type VoidPaymentButtonProps = {
  paymentId: string;
  label?: string;
};

export function VoidPaymentButton({
  paymentId,
  label = "Anular",
}: VoidPaymentButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const result = await voidPayment(paymentId);
      if (!result.ok) {
        toast.error(result.error ?? "No pudimos anular el pago.");
        return;
      }
      toast.success("Pago anulado");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 gap-1 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Undo2 className="size-3.5" aria-hidden />
        {label}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular este pago?</AlertDialogTitle>
            <AlertDialogDescription>
              El pago quedará registrado como anulado y su movimiento se
              revertirá del bankroll. Podrás volver a registrarlo si hace falta.
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
              {pending ? "Anulando…" : "Anular pago"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
