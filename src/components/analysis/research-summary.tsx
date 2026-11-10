import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatOdds, formatPercent } from "@/lib/format";
import { researchBetHref } from "@/lib/parlay/bet-link";
import {
  bestArbitrage,
  bestPriceFor,
  consensusFor,
  moneylineNoVig,
  sharpBook,
} from "@/lib/parlay/analysis";
import type { ParlayEvent } from "@/lib/parlay/analysis";
import { cn } from "@/lib/utils";

export function ResearchSummary({
  event,
  sportKey,
}: {
  event: ParlayEvent;
  sportKey: string;
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
    return (
      <section className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
        Ninguna casa cotizó el ganador de este partido.
      </section>
    );
  }

  const consensus = consensusFor(books, ordered);
  const probabilities =
    sharp?.probabilities ??
    Object.fromEntries(
      ordered.map((name) => [name, consensus[name] ?? 0]),
    );
  const favorite = ordered.reduce((best, name) =>
    (probabilities[name] ?? 0) > (probabilities[best] ?? 0) ? name : best,
  );
  const favoriteProbability = probabilities[favorite] ?? 0;
  const consensusFavorite = consensus[favorite];
  const difference =
    sharp && consensusFavorite !== null
      ? (favoriteProbability - consensusFavorite) * 100
      : null;
  const price = bestPriceFor(event, "h2h", favorite);
  const cases = bestArbitrage(event, 1);
  const arbitrage = cases[0] && cases[0].sum < 1 ? cases[0] : null;

  return (
    <section
      aria-label="Resumen del partido"
      className="rounded-xl border bg-card p-3"
    >
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        En resumen
      </p>

      <p className="mt-1 text-[15px] leading-snug font-semibold">
        Lo más probable: {favorite}{" "}
        <span className="text-primary tabular-nums">
          {formatPercent(favoriteProbability, { decimals: 0 })}
        </span>
      </p>

      <p className="mt-1 text-xs leading-snug text-muted-foreground">
        {sharp
          ? `La referencia ${sharp.title} le da ${formatPercent(favoriteProbability, {
              decimals: 0,
            })}`
          : `El consenso de casas le da ${formatPercent(favoriteProbability, {
              decimals: 0,
            })}`}
        {difference !== null
          ? ` · ${Math.abs(difference).toFixed(1)} puntos ${
              difference > 0 ? "por encima" : "por debajo"
            } del consenso.`
          : "."}
      </p>

      <p className="mt-1 text-xs text-muted-foreground">
        Mejor cuota:{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {price ? formatOdds(price.price) : "—"}
        </span>
        {price ? ` en ${price.book}` : ""}.
      </p>

      {price && (
        <Button asChild size="sm" className="mt-2 h-9 w-full gap-1 text-xs">
          <Link
            href={researchBetHref({
              event,
              sportKey,
              market: "Ganador del partido",
              selection: favorite,
              odds: price.price,
            })}
          >
            Registrar {formatOdds(price.price)} en {price.book}
          </Link>
        </Button>
      )}

      <p
        className={cn(
          "mt-1.5 rounded-lg px-2 py-1 text-xs font-medium",
          arbitrage
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-muted/40 text-muted-foreground",
        )}
      >
        {arbitrage
          ? `Hay arbitraje: ${arbitrage.profitPct.toFixed(2)}% de margen.`
          : "No hay arbitraje entre las casas consultadas."}
      </p>
    </section>
  );
}
