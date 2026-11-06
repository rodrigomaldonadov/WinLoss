import type { HistoryStat } from "@/lib/consensus";
import type { ConsensusScope } from "@/lib/data/consensus";
import { formatOdds } from "@/lib/format";
import { cn } from "@/lib/utils";

type HistoryStatsProps = {
  stats: HistoryStat[];
  scope: ConsensusScope;
};

const MIN_SAMPLE = 2;
const MAX_ROWS = 4;

/** Rendimiento histórico por mercado/opción usado por el modelo. */
export function HistoryStats({ stats, scope }: HistoryStatsProps) {
  const rows = stats
    .filter((stat) => stat.settled >= MIN_SAMPLE)
    .slice(0, MAX_ROWS);
  const title =
    scope === "mine" ? "Tu histórico" : "Histórico de la comunidad";

  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[10px] text-muted-foreground">
          Legs simples liquidados
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Cuando liquides apuestas simples, aquí verás el acierto por mercado y
          se usará para ajustar las probabilidades.
        </p>
      ) : (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {rows.map((stat) => (
            <li
              key={stat.key}
              className="rounded-lg bg-muted/40 px-3 py-2"
            >
              <p className="truncate text-[10px] text-muted-foreground">
                {stat.marketLabel}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {stat.optionLabel}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold tabular-nums",
                    stat.rate >= 0.5 ? "text-success" : "text-loss",
                  )}
                >
                  {Math.round(stat.rate * 100)}%
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {stat.settled} pick{stat.settled === 1 ? "" : "s"}
                {stat.averageOdds !== null
                  ? ` · cuota media ${formatOdds(stat.averageOdds)}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground">
        El histórico se usa para ajustar las probabilidades de los próximos
        partidos. No incluye builders.
      </p>
    </section>
  );
}
