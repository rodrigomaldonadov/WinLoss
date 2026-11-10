import { formatOdds } from "@/lib/format";
import { bestArbitrage } from "@/lib/parlay/analysis";
import type { ParlayEvent } from "@/lib/parlay/analysis";
import { cn } from "@/lib/utils";

export function ResearchArbitrage({ event }: { event: ParlayEvent }) {
  const cases = bestArbitrage(event, 6);
  const best = cases[0];
  const arbitrage = best && best.sum < 1 ? best : null;

  if (!best) {
    return (
      <section className="rounded-xl border bg-muted/20 p-3">
        <h2 className="text-sm font-semibold">Arbitraje</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Faltan cuotas comparables (1X2 o totales) para calcularlo.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="arbitraje" className="space-y-2">
      <h2 id="arbitraje" className="text-sm font-semibold">
        Arbitraje
      </h2>

      <div
        className={cn(
          "rounded-xl border p-3",
          arbitrage
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "bg-muted/20",
        )}
      >
        <p
          className={cn(
            "text-sm font-semibold",
            arbitrage && "text-emerald-700 dark:text-emerald-300",
          )}
        >
          {arbitrage ? "Sí hay arbitraje" : "No hay arbitraje"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {arbitrage
            ? `Ganancia teórica del ${arbitrage.profitPct.toFixed(2)}% combinando las mejores cuotas.`
            : `El mejor caso deja ${((best.sum - 1) * 100).toFixed(2)}% de margen a favor de las casas.`}
        </p>
      </div>

      <details className="rounded-xl border bg-muted/10 px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-medium">
          Ver el mejor caso
        </summary>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Se combinan la mejor cuota de cada lado entre todas las casas. Hay
          arbitraje si 1/cuota A + 1/cuota B es menor que 1.
        </p>
        <ul className="mt-1.5 space-y-1.5">
          {cases.map((item) => {
            const positive = item.sum < 1;
            return (
              <li
                key={`${item.market}-${item.point ?? "h2h"}`}
                className={cn(
                  "rounded-lg border bg-card px-2.5 py-1.5",
                  positive && "border-emerald-500/40",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-medium">
                    {item.market === "h2h" ? "Ganador" : `Total ${item.point}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    suma {item.sum.toFixed(3)}
                    {positive ? ` · +${item.profitPct.toFixed(2)}%` : ""}
                  </p>
                </div>
                <p className="mt-0.5 text-[10px] break-words text-muted-foreground">
                  {item.legs
                    .map(
                      (leg) =>
                        `${leg.label} ${formatOdds(leg.price)} (${leg.book})`,
                    )
                    .join(" + ")}
                </p>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
