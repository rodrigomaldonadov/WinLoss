import Link from "next/link";
import { CalendarDays, ChevronRight, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { probabilityLabel } from "@/lib/analysis/view";
import type { AnalysisHistoryItem } from "@/lib/data/analysis-history";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function HistoryRow({
  item,
  timeZone,
}: {
  item: AnalysisHistoryItem;
  timeZone?: string;
}) {
  const saved = item.mode === "saved";

  return (
    <article className="group relative rounded-lg border bg-card p-2 shadow-xs transition-colors hover:bg-muted/30">
      <Link
        href={`/analysis/historial/${item.id}`}
        aria-label={`Ver el análisis de ${item.homeName} vs ${item.awayName}`}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="pointer-events-none relative z-10">
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <CalendarDays className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{item.competition}</span>
            <span aria-hidden>·</span>
            <time
              dateTime={item.playedAt.toISOString()}
              className="shrink-0 tabular-nums"
            >
              {formatDate(item.playedAt, {
                day: "2-digit",
                month: "short",
                year: "numeric",
                ...(timeZone ? { timeZone } : {}),
              })}
            </time>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {item.provisional && (
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[9px] font-medium text-muted-foreground"
                title="Resultado provisional de la API; el CSV oficial puede cambiarlo."
              >
                Provisional
              </Badge>
            )}
            <Badge
              variant={saved ? "secondary" : "outline"}
              className={cn(
                "h-4 px-1.5 text-[9px] font-medium",
                saved ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
              title={
                saved
                  ? "Hay una captura del análisis guardada antes del inicio."
                  : "No hay captura previa; el detalle se reconstruye con los ratings de esa semana."
              }
            >
              {saved ? "Guardada" : "Reconstruida"}
            </Badge>
          </div>
        </div>

        <div className="mt-1 flex items-baseline justify-between gap-2">
          <h2 className="min-w-0 truncate text-[13px] leading-tight font-semibold">
            {item.homeName}{" "}
            <span className="font-normal text-muted-foreground">vs</span>{" "}
            {item.awayName}
          </h2>
          <p className="flex shrink-0 items-center gap-0.5 text-[15px] leading-none font-bold tabular-nums">
            <span className="sr-only">Resultado </span>
            {item.homeGoals}–{item.awayGoals}
            <ChevronRight
              className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </p>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <p className="min-w-0 truncate">
            {item.prediction ? (
              <>
                <span className="font-medium">1X2 guardado</span>
                {" · "}
                {probabilityLabel(item.prediction.home)} /{" "}
                {probabilityLabel(item.prediction.draw)} /{" "}
                {probabilityLabel(item.prediction.away)}
              </>
            ) : saved ? (
              "Captura sin probabilidad 1X2"
            ) : (
              "Sin captura previa al inicio"
            )}
          </p>
          {item.hasBet && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-primary">
              <Ticket className="size-3" aria-hidden />
              Tu apuesta
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
