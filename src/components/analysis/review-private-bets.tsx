import type { ReviewPrivateLeg } from "@/lib/analysis/review/types";
import { formatOdds } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "text-muted-foreground" },
  WON: { label: "Ganada", className: "text-success" },
  LOST: { label: "Perdida", className: "text-loss" },
  VOID: { label: "Nula", className: "text-muted-foreground" },
  HALF_WON: { label: "Media ganada", className: "text-success" },
  HALF_LOST: { label: "Media perdida", className: "text-loss" },
};

function statusOf(status: string) {
  return STATUS[status] ?? { label: status, className: "text-muted-foreground" };
}

export function ReviewPrivateBets({ legs }: { legs: ReviewPrivateLeg[] }) {
  if (legs.length === 0) return null;

  return (
    <section aria-labelledby="tus-apuestas" className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="tus-apuestas" className="text-sm font-semibold">
          Tus apuestas en este partido
        </h2>
        <span className="text-[0.625rem] text-muted-foreground">
          Solo visible para ti
        </span>
      </div>

      <ul className="space-y-1.5">
        {legs.map((leg) => {
          const status = statusOf(leg.status);
          return (
            <li key={leg.id} className="rounded-lg border bg-card px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-[0.6875rem] font-medium">
                  {leg.eventName}
                </p>
                <span
                  className={cn(
                    "shrink-0 text-[0.625rem] font-semibold",
                    status.className,
                  )}
                >
                  {status.label}
                </span>
              </div>

              <ul className="mt-1 space-y-0.5 text-[0.6875rem] text-muted-foreground">
                {leg.selections.map((selection, index) => (
                  <li key={`${leg.id}-${index}`} className="truncate">
                    {selection.market} · {selection.selection}
                    {selection.line !== null ? ` ${selection.line}` : ""}
                  </li>
                ))}
              </ul>

              <p className="mt-1 text-[0.625rem] text-muted-foreground">
                Tu cuota{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatOdds(leg.odds)}
                </span>
                {leg.fairOdds !== null
                  ? ` · cuota justa del mercado ${formatOdds(leg.fairOdds)}`
                  : " · sin cuota justa (mercado no guardado)"}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="text-[0.625rem] leading-snug text-muted-foreground">
        La cuota justa es 1 / probabilidad del mercado guardado. Es una
        comparación, no una recomendación.
      </p>
    </section>
  );
}
