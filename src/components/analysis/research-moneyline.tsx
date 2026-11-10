import Link from "next/link";

import { formatOdds, formatPercent } from "@/lib/format";
import { researchBetHref } from "@/lib/parlay/bet-link";
import {
  bestPriceFor,
  centsDifference,
  consensusFor,
  formatCents,
  moneylineNoVig,
  sharpBook,
} from "@/lib/parlay/analysis";
import type {
  ParlayEvent,
  ParlayMovement,
} from "@/lib/parlay/analysis";
import { cn } from "@/lib/utils";

export function ResearchMoneyline({
  event,
  sportKey,
  movement,
}: {
  event: ParlayEvent;
  sportKey: string;
  movement: ParlayMovement;
}) {
  const books = moneylineNoVig(event);
  const sharp = sharpBook(books);

  const names = new Set<string>();
  for (const book of event.bookmakers) {
    const market = book.markets.find((item) => item.key === "h2h");
    market?.outcomes.forEach((outcome) => names.add(outcome.name));
  }
  const ordered = [
    event.home_team,
    ...[...names].filter(
      (name) => name !== event.home_team && name !== event.away_team,
    ),
    event.away_team,
  ].filter((name) => names.has(name));

  if (books.length === 0 || ordered.length === 0) {
    return null;
  }

  const consensus = consensusFor(books, ordered);
  const rows = ordered.map((outcome) => {
    const probability =
      sharp?.probabilities[outcome] ?? consensus[outcome] ?? null;
    return {
      outcome,
      probability,
      consensus: consensus[outcome] ?? null,
      cents: centsDifference(
        sharp?.probabilities[outcome] ?? null,
        consensus[outcome] ?? null,
      ),
      best: bestPriceFor(event, "h2h", outcome),
    };
  });

  return (
    <section aria-labelledby="cuotas" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="cuotas" className="text-sm font-semibold">
          Probabilidad y mejor cuota
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {books.length} casas
        </span>
      </div>

      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {rows.map((row) => {
          const move = row.best
            ? movement[`${row.best.book}|${row.outcome}`]
            : undefined;
          const delta =
            move && move.previous !== null ? move.price - move.previous : null;
          return (
            <li
              key={row.outcome}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{row.outcome}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {row.probability === null
                  ? "sin probabilidad"
                  : formatPercent(row.probability, { decimals: 0 })}{" "}
                de probabilidad
              </p>
            </div>
            <div className="shrink-0 text-right">
              {row.best ? (
                <Link
                  href={researchBetHref({
                    event,
                    sportKey,
                    market: "Ganador del partido",
                    selection: row.outcome,
                    odds: row.best.price,
                  })}
                  aria-label={`Registrar ${row.outcome} a ${formatOdds(row.best.price)} en ${row.best.book}`}
                  className="block underline-offset-2 hover:underline"
                >
                  <p className="text-[15px] leading-none font-bold tabular-nums">
                    {formatOdds(row.best.price)}
                  </p>
                  <p className="mt-0.5 max-w-24 truncate text-[10px] text-muted-foreground">
                    {row.best.book}
                  </p>
                </Link>
              ) : (
                <>
                  <p className="text-[15px] leading-none font-bold tabular-nums">
                    —
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    no cotizó
                  </p>
                </>
              )}
              {delta !== null && Math.abs(delta) >= 0.005 && (
                <p
                  className={cn(
                    "mt-0.5 text-[10px] font-medium tabular-nums",
                    delta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}
                </p>
              )}
            </div>
          </li>
          );
        })}
      </ul>

      <details className="rounded-xl border bg-muted/10 px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-medium">
          Cómo se calcula y desglose por casa
        </summary>

        <div className="mt-2 space-y-2">
          <p className="text-[10px] leading-snug text-muted-foreground">
            {sharp
              ? `La referencia es ${sharp.title}, una casa de margen bajo. Pinnacle no está en ParlayAPI. El consenso es la mediana del resto de casas, sin vig (sin margen).`
              : "No hay una casa de referencia (Novig/ProphetX); se muestra el consenso sin vig."}{" "}
            La diferencia va en puntos de probabilidad: 1 punto = 1%.
          </p>

          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {rows.map((row) => (
              <li
                key={`detalle-${row.outcome}`}
                className="flex items-baseline justify-between gap-2 px-2.5 py-1.5 text-[10px]"
              >
                <span className="truncate font-medium">{row.outcome}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {row.probability === null
                    ? "—"
                    : formatPercent(row.probability, { decimals: 1 })}
                  {" · consenso "}
                  {row.consensus === null
                    ? "—"
                    : formatPercent(row.consensus, { decimals: 1 })}
                  {row.cents === null ? "" : ` · ${formatCents(row.cents)}`}
                </span>
              </li>
            ))}
          </ul>

          <ul className="space-y-1">
            {[...books]
              .sort((left, right) => left.overround - right.overround)
              .map((book) => (
                <li
                  key={book.key}
                  className="flex items-baseline justify-between gap-2 text-[10px]"
                >
                  <span className="truncate font-medium">{book.title}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {ordered
                      .map((name) =>
                        book.probabilities[name] === undefined
                          ? "—"
                          : formatPercent(book.probabilities[name], {
                              decimals: 1,
                            }),
                      )
                      .join(" / ")}
                    {" · margen "}
                    {(book.overround * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
