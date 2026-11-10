import { formatOdds } from "@/lib/format";
import { bestArbitrage } from "@/lib/parlay/analysis";
import type { ParlayEvent } from "@/lib/parlay/analysis";
import { cn } from "@/lib/utils";

export function ResearchArbitrage({ event }: { event: ParlayEvent }) {
  const cases = bestArbitrage(event, 6);
  const arbitrage = cases.filter((item) => item.sum < 1);

  return (
    <section aria-labelledby="arbitraje" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="arbitraje" className="text-sm font-semibold">
          Arbitraje
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {arbitrage.length > 0
            ? `${arbitrage.length} caso${arbitrage.length === 1 ? "" : "s"}`
            : "sin casos"}
        </span>
      </div>

      {cases.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No hay dos cuotas comparables (1X2 o totales) para calcular el
          arbitraje.
        </p>
      ) : (
        <>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Se combinan la mejor cuota de cada lado entre todas las casas. Hay
            arbitraje si 1/cuota A + 1/cuota B &lt; 1.
          </p>
          <ul className="space-y-1.5">
            {cases.map((item) => {
              const isArbitrage = item.sum < 1;
              return (
                <li
                  key={`${item.market}-${item.point ?? "h2h"}`}
                  className={cn(
                    "rounded-lg border px-2.5 py-2",
                    isArbitrage && "border-emerald-500/40 bg-emerald-500/10",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-medium">
                      {item.market === "h2h"
                        ? "1X2"
                        : `Total ${item.point}`}
                    </p>
                    <p
                      className={cn(
                        "text-[11px] font-semibold tabular-nums",
                        isArbitrage ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
                      )}
                    >
                      suma {item.sum.toFixed(3)}
                      {isArbitrage
                        ? ` · ${item.profitPct.toFixed(2)}%`
                        : ""}
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
          {arbitrage.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              El mejor caso no llega a arbitraje; el margen queda en{" "}
              {(cases[0]!.sum - 1).toFixed(3)}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
