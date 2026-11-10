import { formatOdds, formatPercent } from "@/lib/format";
import {
  bestPriceFor,
  centsDifference,
  consensusFor,
  formatCents,
  impliedProbability,
  moneylineNoVig,
  sharpBook,
} from "@/lib/parlay/analysis";
import type { ParlayEvent } from "@/lib/parlay/analysis";

export function ResearchMoneyline({ event }: { event: ParlayEvent }) {
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
      <section aria-labelledby="sharp" className="space-y-1.5">
        <h2 id="sharp" className="text-sm font-semibold">
          Sharp vs consenso
        </h2>
        <p className="text-[11px] text-muted-foreground">
          Ninguna de las casas consultadas cotizó el 1X2 de este partido.
        </p>
      </section>
    );
  }

  const consensus = consensusFor(books, ordered);
  const rows = ordered.map((outcome) => {
    const sharpProbability = sharp?.probabilities[outcome] ?? null;
    return {
      outcome,
      sharp: sharpProbability,
      consensus: consensus[outcome] ?? null,
      cents: centsDifference(sharpProbability, consensus[outcome] ?? null),
      best: bestPriceFor(event, "h2h", outcome),
    };
  });

  return (
    <section aria-labelledby="sharp" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sharp" className="text-sm font-semibold">
          Sharp vs consenso
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {books.length} casas
        </span>
      </div>

      <p className="rounded-lg border bg-muted/20 px-2.5 py-2 text-[10px] leading-snug text-muted-foreground">
        {sharp ? (
          <>
            Referencia sharp: <strong className="text-foreground">{sharp.title}</strong>. Pinnacle no
            está en el catálogo de ParlayAPI, así que se usa Novig (o ProphetX)
            como sustituto.
          </>
        ) : (
          <>
            Sin referencia sharp: Novig y ProphetX no cotizaron este partido.
            Solo se muestra el consenso sin vig.
          </>
        )}{" "}
        El consenso es la mediana de las casas retail, sin vig; no es un
        porcentaje de apuestas del público (la API no lo publica).
      </p>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full table-fixed border-collapse text-[11px]">
          <thead>
            <tr className="border-b bg-muted/40 text-[10px] text-muted-foreground">
              <th className="w-[32%] px-2 py-1.5 text-left font-medium">
                Resultado
              </th>
              <th className="px-1 py-1.5 text-right font-medium">Sharp</th>
              <th className="px-1 py-1.5 text-right font-medium">Consenso</th>
              <th className="px-1 py-1.5 text-right font-medium">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.outcome} className="border-b last:border-0">
                <th scope="row" className="truncate px-2 py-1 text-left font-normal">
                  {row.outcome}
                </th>
                <td className="px-1 py-1 text-right tabular-nums">
                  {row.sharp === null ? "—" : formatPercent(row.sharp)}
                </td>
                <td className="px-1 py-1 text-right tabular-nums">
                  {row.consensus === null ? "—" : formatPercent(row.consensus)}
                </td>
                <td className="px-1 py-1 text-right text-[10px] tabular-nums">
                  {formatCents(row.cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-[11px] font-medium text-muted-foreground">
          Mejor cuota por resultado
        </h3>
        <ul className="mt-1 flex flex-wrap gap-1">
          {rows.map((row) => (
            <li
              key={row.outcome}
              className="rounded-full border bg-background px-2 py-1 text-[10px]"
            >
              {row.outcome}{" "}
              {row.best ? (
                <>
                  <strong className="tabular-nums">
                    {formatOdds(row.best.price)}
                  </strong>{" "}
                  <span className="text-muted-foreground">
                    · {row.best.book}
                  </span>
                </>
              ) : (
                "—"
              )}
            </li>
          ))}
        </ul>
      </div>

      <details className="rounded-lg border bg-muted/10 px-2.5 py-2">
        <summary className="cursor-pointer text-[11px] font-medium">
          Sin vig por casa y margen
        </summary>
        <ul className="mt-1.5 space-y-1">
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
                  {" · "}
                  vig {(book.overround * 100).toFixed(1)}%
                </span>
              </li>
            ))}
        </ul>
      </details>

      <p className="text-[10px] text-muted-foreground">
        Probabilidad implícita bruta de la mejor cuota:{" "}
        {rows
          .filter((row) => row.best)
          .map(
            (row) =>
              `${row.outcome} ${(impliedProbability(row.best!.price) * 100).toFixed(1)}%`,
          )
          .join(" · ")}
        .
      </p>
    </section>
  );
}
