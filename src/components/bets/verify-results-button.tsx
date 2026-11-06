"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  applyPendingResultsAction,
  syncPendingResultsAction,
  type AutoSettleActionResult,
} from "@/lib/actions/auto-settle";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const NOTICE_LABEL = {
  POSTPONED: "Evento pospuesto",
  CANCELLED: "Evento cancelado",
  NO_90_MINUTES: "Marcador sin 90 minutos",
  UNRESOLVABLE: "Mercado no auto-liquidable",
} as const;

type Proposals = Extract<AutoSettleActionResult, { ok: true }>;

type VerifyResultsButtonProps = {
  variant?: "default" | "outline" | "ghost";
  className?: string;
};

export function VerifyResultsButton({
  variant = "outline",
  className,
}: VerifyResultsButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Proposals | null>(null);

  const handleSync = async () => {
    setLoading(true);
    try {
      const response = await syncPendingResultsAction();
      if (!response.ok) {
        toast.error(response.error);
        return;
      }

      if (response.applied > 0) {
        toast.success(
          `${response.applied} boleto${response.applied === 1 ? "" : "s"} liquidado${response.applied === 1 ? "" : "s"} automáticamente`,
        );
        router.refresh();
      }

      if (response.proposals.length > 0 || response.notices.length > 0) {
        setResult(response);
        setOpen(true);
      } else if (response.applied === 0) {
        toast.info("No hay resultados nuevos para liquidar.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      const response = await applyPendingResultsAction();
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      toast.success(
        `${response.applied} boleto${response.applied === 1 ? "" : "s"} actualizado${response.applied === 1 ? "" : "s"}`,
      );
      setOpen(false);
      setResult(null);
      router.refresh();
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        className={cn("size-11 gap-0 p-0 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3", className)}
        aria-label="Verificar resultados"
        onClick={() => void handleSync()}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-4" aria-hidden />
        )}
        <span className="hidden text-xs sm:inline">Verificar resultados</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-2xl pb-6 sm:mx-auto sm:max-w-lg"
        >
          <SheetHeader className="pb-2">
            <SheetTitle>Resultados propuestos</SheetTitle>
            <SheetDescription>
              Revisa lo que encontramos. Nada se aplica hasta que confirmes.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 px-4 pb-4">
            {result?.proposals.map((proposal) => (
              <div
                key={proposal.betId}
                className="rounded-lg border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {proposal.eventName}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {proposal.status}
                  </Badge>
                </div>
                <ul className="mt-2 space-y-1">
                  {proposal.legs.map((leg) => (
                    <li
                      key={leg.legId}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {leg.eventName}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {leg.scoreHome}-{leg.scoreAway} ·{" "}
                        <strong className="text-foreground">{leg.to}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Resultado:{" "}
                  <strong
                    className={cn(
                      "tabular-nums",
                      proposal.profit > 0
                        ? "text-success"
                        : proposal.profit < 0
                          ? "text-loss"
                          : "text-foreground",
                    )}
                  >
                    {proposal.profit > 0 ? "+" : ""}
                    {formatCurrency(proposal.profit, proposal.currency)}
                  </strong>
                </p>
              </div>
            ))}

            {result?.notices.map((notice, index) => (
              <p
                key={`${notice.betId}-${notice.reason}-${index}`}
                className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
              >
                <strong>{NOTICE_LABEL[notice.reason]}</strong> ·{" "}
                {notice.eventName}. Decídelo manualmente.
              </p>
            ))}

            {result && result.proposals.length > 0 ? (
              <Button
                type="button"
                className="h-11 w-full"
                onClick={() => void handleApply()}
                disabled={applying}
              >
                {applying ? "Aplicando…" : "Aplicar resultados"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={() => setOpen(false)}
              >
                Cerrar
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
