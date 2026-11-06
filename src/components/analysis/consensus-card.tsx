import { CalendarDays, Users } from "lucide-react";

import type { ConsensusMatch } from "@/lib/consensus";
import { formatDateTime, formatOdds } from "@/lib/format";
import { cn } from "@/lib/utils";

type ConsensusCardProps = {
  match: ConsensusMatch;
  timeZone?: string;
};

function percent(share: number): number {
  return Math.round(share * 100);
}

function probabilityLabel(value: number | null): string {
  return value === null ? "—" : `${percent(value)}%`;
}

/** Tarjeta de consenso y probabilidad estimada para un partido próximo. */
export function ConsensusCard({ match, timeZone }: ConsensusCardProps) {
  const primary = match.primary;
  const secondary = match.markets.slice(1, 4);
  const lowSample = primary.total < 3 || match.users < 2;
  const leaderProbability = primary.leader.probability;

  const components: string[] = [];
  if (primary.leader.marketProbability !== null) {
    components.push(
      `cuota ${probabilityLabel(primary.leader.marketProbability)}`,
    );
  }
  if (
    primary.leader.historyRate !== null &&
    primary.leader.historySettled > 0
  ) {
    components.push(
      `histórico ${probabilityLabel(primary.leader.historyRate)} (${primary.leader.historySettled})`,
    );
  }
  components.push(`${primary.total} picks`);

  return (
    <article className="min-w-0 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {match.competition ?? match.sport}
          </p>
          <h2 className="mt-0.5 truncate text-sm font-semibold">
            {match.eventName}
          </h2>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            {formatDateTime(match.eventDate, timeZone)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold tabular-nums text-primary">
          {match.picks} pick{match.picks === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-3 rounded-lg bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs font-medium">
            {primary.label}
          </p>
          {lowSample && (
            <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              Muestra baja
            </span>
          )}
        </div>

        <p className="mt-1 text-sm">
          <span className="font-semibold">{primary.leader.label}</span>
          <span className="text-muted-foreground">
            {leaderProbability !== null
              ? ` · ${percent(leaderProbability)}% prob. estimada`
              : ` · ${primary.leader.count} de ${primary.total} picks`}
          </span>
        </p>

        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {components.join(" · ")}
        </p>

        {primary.hasDistribution ? (
          <ul className="mt-2 space-y-1.5">
            {primary.options.slice(0, 4).map((option) => {
              const active = option.key === primary.leader.key;
              const value = option.probability ?? option.share;
              return (
                <li key={option.key} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-24 shrink-0 truncate text-[11px]",
                      active
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground",
                    )}
                    title={option.label}
                  >
                    {option.label}
                  </span>
                  <span
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                    aria-hidden
                  >
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        active ? "bg-primary" : "bg-primary/35",
                      )}
                      style={{ width: `${Math.max(4, percent(value))}%` }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums">
                    {percent(value)}%
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Solo hay picks para una opción; la probabilidad no se compara con
            otras opciones del mercado.
          </p>
        )}
      </div>

      {secondary.length > 0 && (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {secondary.map((market) => {
            const hasProbability = market.leader.probability !== null;
            const value = market.leader.probability ?? market.leader.share;
            return (
              <li
                key={market.key}
                className="min-w-0 rounded-lg border bg-background px-2.5 py-2"
              >
                <p className="truncate text-[10px] text-muted-foreground">
                  {market.label}
                </p>
                <p className="mt-0.5 truncate text-xs font-medium">
                  {market.leader.label} · {percent(value)}%
                  {hasProbability ? " prob." : " de picks"}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {market.total} pick{market.total === 1 ? "" : "s"}
                  {market.total < 3 ? " · muestra baja" : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="size-3.5" aria-hidden />
          {match.users} usuario{match.users === 1 ? "" : "s"}
        </span>
        {match.averageOdds !== null && (
          <span>Cuota media {formatOdds(match.averageOdds)}</span>
        )}
      </div>
    </article>
  );
}
