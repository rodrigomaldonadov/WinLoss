import { Fragment } from "react";

import { probabilityLabel } from "@/lib/analysis/view";
import type { ReviewResult } from "@/lib/analysis/review/types";
import { cn } from "@/lib/utils";

const MARKET_ORDER = [
  "1X2",
  "Doble oportunidad",
  "Total de goles",
  "Ambos marcan",
] as const;

const OUTCOME_LABEL = {
  HOME: "Ganó el local",
  DRAW: "Empate",
  AWAY: "Ganó el visitante",
} as const;

const OUTCOME_KEY = {
  HOME: "home",
  DRAW: "draw",
  AWAY: "away",
} as const;

function probabilityCell(value: number | null) {
  if (value === null) {
    return (
      <td className="px-1 py-1 text-right text-muted-foreground">
        <span title="No guardado">—</span>
        <span className="sr-only">No guardado</span>
      </td>
    );
  }
  return (
    <td className="px-1 py-1 text-right tabular-nums">
      {probabilityLabel(value)}
    </td>
  );
}

function chancesForOccurred(
  review: ReviewResult,
): { label: string; value: number | null }[] {
  const key = OUTCOME_KEY[review.actualOutcome];
  const row = review.rows.find((item) => item.key === `1X2_${review.actualOutcome}`);

  if (row) {
    return [
      { label: "Mercado pre", value: row.probabilities.marketPre },
      { label: "Mercado cierre", value: row.probabilities.marketClose },
      { label: "Modelo", value: row.probabilities.model },
      { label: "Final mostrada", value: row.probabilities.final },
    ].filter((item) => item.value !== null);
  }

  return [
    { label: "Mercado pre", value: review.marketPre?.[key] ?? null },
    { label: "Mercado cierre", value: review.marketClose?.[key] ?? null },
    { label: "Final mostrada", value: review.final1x2?.[key] ?? null },
  ].filter((item) => item.value !== null);
}

export function ReviewMarketTable({ review }: { review: ReviewResult }) {
  const rows = review.rows;
  const hasPre = rows.some((row) => row.probabilities.marketPre !== null);
  const hasClose = rows.some(
    (row) => row.probabilities.marketClose !== null,
  );
  const hasModel = rows.some((row) => row.probabilities.model !== null);
  const hasFinal = rows.some((row) => row.probabilities.final !== null);
  const columns = 1 + [hasPre, hasClose, hasModel, hasFinal].filter(
    Boolean,
  ).length;
  const hasMarket = hasPre || hasClose;
  const occurred = chancesForOccurred(review);
  const groups = MARKET_ORDER.map((market) => ({
    market,
    rows: rows.filter((row) => row.market === market),
  })).filter((group) => group.rows.length > 0);

  return (
    <section aria-labelledby="mercados" className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="mercados" className="text-sm font-semibold">
          Por mercado
        </h2>
        <span className="text-[0.625rem] text-muted-foreground">N = 1 partido</span>
      </div>

      <div className="rounded-lg border bg-muted/20 px-2.5 py-2">
        <p className="text-[0.6875rem] font-medium">
          Lo que ocurrió: {OUTCOME_LABEL[review.actualOutcome]} (
          {review.homeGoals}–{review.awayGoals})
        </p>
        {occurred.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem]">
            {occurred.map((item) => (
              <li key={item.label}>
                <span className="text-muted-foreground">{item.label}</span>{" "}
                <strong className="tabular-nums">
                  {probabilityLabel(item.value)}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[0.6875rem] text-muted-foreground">
            Ninguna fuente guardó una probabilidad para lo que ocurrió.
          </p>
        )}
      </div>

      {!hasMarket && (
        <p className="text-[0.6875rem] text-muted-foreground">
          Sin cuotas de mercado para este partido: la fuente Mercado no está
          disponible.
        </p>
      )}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full table-fixed border-collapse text-[0.6875rem]">
            <thead>
              <tr className="border-b bg-muted/40 text-[0.625rem] text-muted-foreground">
                <th className="w-[34%] px-2 py-1.5 text-left font-medium">
                  Selección
                </th>
                {hasPre && (
                  <th className="px-1 py-1.5 text-right font-medium">Pre</th>
                )}
                {hasClose && (
                  <th className="px-1 py-1.5 text-right font-medium">
                    Cierre
                  </th>
                )}
                {hasModel && (
                  <th className="px-1 py-1.5 text-right font-medium">Modelo</th>
                )}
                {hasFinal && (
                  <th className="px-1 py-1.5 text-right font-medium">Final</th>
                )}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.market}>
                  <tr className="border-b bg-muted/20">
                    <th
                      colSpan={columns}
                      className="px-2 py-1 text-left text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {group.market}
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr
                      key={row.key}
                      className={cn(
                        "border-b last:border-0",
                        row.actual && "bg-primary/10",
                      )}
                    >
                      <th
                        scope="row"
                        className={cn(
                          "px-2 py-1 text-left font-normal",
                          row.actual && "font-semibold",
                        )}
                      >
                        {row.actual && (
                          <span
                            aria-hidden
                            className="mr-1 inline-block size-1.5 rounded-full bg-primary align-middle"
                          />
                        )}
                        {row.selection}
                        {row.actual && (
                          <span className="sr-only"> (ocurrió)</span>
                        )}
                      </th>
                      {hasPre && probabilityCell(row.probabilities.marketPre)}
                      {hasClose &&
                        probabilityCell(row.probabilities.marketClose)}
                      {hasModel && probabilityCell(row.probabilities.model)}
                      {hasFinal && probabilityCell(row.probabilities.final)}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed bg-muted/20 px-2.5 py-3 text-[0.6875rem] text-muted-foreground">
          Esta captura no guardó mercados del modelo. Solo se muestran las
          probabilidades 1X2 del mercado y la final que se mostró.
        </p>
      )}

      <p className="text-[0.625rem] text-muted-foreground">
        <span aria-hidden>●</span> Fila resaltada = lo que ocurrió · — = no
        guardado. Probabilidades redondeadas al punto porcentual.
      </p>
    </section>
  );
}

