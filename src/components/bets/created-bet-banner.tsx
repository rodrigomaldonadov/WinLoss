"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CopyPlus, Plus, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { undoCreateBet } from "@/lib/actions/bet";

const DRAFT_KEY = "winloss:bet-draft:v1";

type CreatedBetBannerProps = {
  betId: string;
};

export function CreatedBetBanner({ betId }: CreatedBetBannerProps) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // sin acceso a storage
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(12);
    }
  }, []);

  const undo = () => {
    startTransition(async () => {
      const result = await undoCreateBet(betId);
      if (result.ok) {
        toast.success("Apuesta eliminada");
        router.replace("/bets");
        router.refresh();
      } else {
        toast.error("No pudimos deshacer la apuesta.");
      }
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      toast.success("Apuesta registrada", {
        duration: 8000,
        action: { label: "Deshacer", onClick: undo },
      });
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hidden) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
        <p className="min-w-0 text-success">
          <span className="font-semibold">Apuesta registrada.</span>{" "}
          <span className="text-success/80">¿Qué quieres hacer ahora?</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={undo}
          disabled={pending}
        >
          <Undo2 className="size-3.5" aria-hidden />
          Deshacer
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs">
          <Link href="/bets/new">
            <Plus className="size-3.5" aria-hidden />
            Registrar otra
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs">
          <Link href={`/bets/new?copy=${betId}`}>
            <CopyPlus className="size-3.5" aria-hidden />
            Copiar
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8"
          aria-label="Cerrar aviso"
          onClick={() => setHidden(true)}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
