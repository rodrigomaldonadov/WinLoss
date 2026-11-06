"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  quickSettleBet,
  reopenBet,
} from "@/lib/actions/bet";
import { cn } from "@/lib/utils";

type QuickSettleButtonsProps = {
  betId: string;
  className?: string;
};

/** Acciones rápidas de liquidación para apuestas simples. */
export function QuickSettleButtons({
  betId,
  className,
}: QuickSettleButtonsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const settle = (status: "WON" | "LOST" | "VOID", label: string) => {
    startTransition(async () => {
      const result = await quickSettleBet(betId, status);
      if (!result.ok) {
        toast.error(result.error ?? "No pudimos liquidar la apuesta.");
        return;
      }

      if ("vibrate" in navigator) navigator.vibrate?.(10);

      toast.success(`Apuesta liquidada: ${label}`, {
        action: {
          label: "Deshacer",
          onClick: () => {
            void reopenBet(betId).then((undo) => {
              if (undo.ok) {
                toast.success("Apuesta reabierta");
                router.refresh();
              }
            });
          },
        },
      });
      router.refresh();
    });
  };

  return (
    <div className={cn("grid grid-cols-3 gap-1.5", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-1 border-success/30 text-[11px] text-success"
        disabled={pending}
        onClick={() => settle("WON", "Ganada")}
      >
        Ganada
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-1 border-destructive/30 text-[11px] text-destructive"
        disabled={pending}
        onClick={() => settle("LOST", "Perdida")}
      >
        Perdida
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 text-[11px]"
        disabled={pending}
        onClick={() => settle("VOID", "Nula")}
      >
        Nula
      </Button>
    </div>
  );
}
