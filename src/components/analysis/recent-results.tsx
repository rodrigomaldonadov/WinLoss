import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { probabilityLabel } from "@/lib/analysis/view";
import type { RecentResultItem } from "@/lib/data/analysis-history";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RecentResults({
  items,
  timeZone,
}: {
  items: RecentResultItem[];
  timeZone?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="ultimos-resultados" className="space-y-1.5 pt-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="ultimos-resultados" className="text-sm font-semibold">
          Últimos resultados
        </h2>
        <Link
          href="/analysis/historial"
          className="text-[0.6875rem] font-medium text-primary underline-offset-4 hover:underline"
        >
          Ver historial
        </Link>
      </div>
      <p className="text-[0.6875rem] leading-snug text-muted-foreground">
        Capturas guardadas de partidos recientes. “Ocurrió” compara con el
        snapshot; no es un veredicto del modelo.
      </p>

      <ul className="grid gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <article className="group relative rounded-lg border bg-card p-2 shadow-xs transition-colors hover:bg-muted/30">
              <Link
                href={`/analysis/historial/${item.id}`}
                aria-label={`Ver el análisis de ${item.homeName} vs ${item.awayName}`}
                className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="pointer-events-none relative z-10">
                <div className="flex items-center justify-between gap-2 text-[0.6875rem] text-muted-foreground">
                  <p className="flex min-w-0 items-center gap-1">
                    <span className="truncate">{item.competition}</span>
                    <span aria-hidden>·</span>
                    <time
                      dateTime={item.playedAt.toISOString()}
                      className="shrink-0 tabular-nums"
                    >
                      {formatDate(item.playedAt, {
                        day: "2-digit",
                        month: "short",
                        ...(timeZone ? { timeZone } : {}),
                      })}
                    </time>
                  </p>
                  {item.provisional && (
                    <Badge
                      variant="outline"
                      className="h-4 shrink-0 px-1.5 text-[0.625rem] font-medium text-muted-foreground"
                      title="Resultado provisional de la API; el CSV oficial puede cambiarlo."
                    >
                      Provisional
                    </Badge>
                  )}
                </div>

                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <h3 className="min-w-0 truncate text-[0.8125rem] leading-tight font-semibold">
                    {item.homeName}{" "}
                    <span className="font-normal text-muted-foreground">vs</span>{" "}
                    {item.awayName}
                  </h3>
                  <p className="shrink-0 text-sm leading-none font-bold tabular-nums">
                    <span className="sr-only">Resultado </span>
                    {item.homeGoals}–{item.awayGoals}
                  </p>
                </div>

                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem]">
                  {item.markets.map((market) => (
                    <li key={market.key} className="whitespace-nowrap">
                      <span className="text-muted-foreground">
                        {market.label}
                      </span>{" "}
                      <span
                        className={cn(
                          market.occurred
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {market.occurred ? "ocurrió" : "no ocurrió"}
                      </span>{" "}
                      <span className="tabular-nums text-muted-foreground">
                        {probabilityLabel(market.probability)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}


