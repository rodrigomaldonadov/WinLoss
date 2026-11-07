import Link from "next/link";
import { CalendarDays, ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HistoryMatchHeader } from "@/lib/data/analysis-history";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function outcomeLabel(homeGoals: number, awayGoals: number): string {
  if (homeGoals > awayGoals) return "Ganó el local";
  if (homeGoals === awayGoals) return "Empate";
  return "Ganó el visitante";
}

export function HistoryDetailHeader({
  header,
  timeZone,
}: {
  header: HistoryMatchHeader;
  timeZone?: string;
}) {
  const saved = header.hasSnapshot;

  return (
    <header className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1 px-2 text-xs text-muted-foreground"
        >
          <Link href="/analysis/historial">
            <ChevronLeft className="size-4" aria-hidden />
            Historial
          </Link>
        </Button>
        <Badge
          variant={saved ? "secondary" : "outline"}
          className={cn(
            "h-5 max-w-full truncate px-1.5 text-[10px] font-medium",
            saved ? "bg-primary/10 text-primary" : "text-muted-foreground",
          )}
        >
          {saved
            ? "Predicción guardada antes del partido"
            : "Reconstrucción retrospectiva"}
        </Badge>
      </div>

      <div>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarDays className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{header.competition}</span>
          <span aria-hidden>·</span>
          <time
            dateTime={header.playedAt.toISOString()}
            className="shrink-0 tabular-nums"
          >
            {formatDate(header.playedAt, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              ...(timeZone ? { timeZone } : {}),
            })}
          </time>
        </p>
        <h1 className="mt-0.5 text-lg leading-tight font-semibold">
          {header.homeName}{" "}
          <span className="font-normal text-muted-foreground">vs</span>{" "}
          {header.awayName}
        </h1>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-3xl leading-none font-bold tabular-nums">
            <span className="sr-only">Resultado final </span>
            {header.homeGoals}–{header.awayGoals}
          </p>
          <p className="text-xs text-muted-foreground">
            {outcomeLabel(header.homeGoals, header.awayGoals)}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {header.provisional && (
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
            title="Resultado provisional de la API; el CSV oficial puede reemplazarlo."
          >
            Resultado provisional
          </Badge>
        )}
        <p
          className={cn(
            "rounded-lg border px-2.5 py-2 text-[11px] leading-snug",
            saved
              ? "bg-muted/30 text-muted-foreground"
              : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
          )}
        >
          {saved
            ? "Captura inmutable guardada antes del inicio. Se muestra tal como quedó; no se recalcula."
            : "Reconstrucción retrospectiva: los ratings usan solo partidos anteriores a la semana del encuentro, pero los parámetros actuales se ajustaron con datos que incluyen este periodo. Es una aproximación, no la predicción que se mostró en su momento."}
        </p>
      </div>
    </header>
  );
}
