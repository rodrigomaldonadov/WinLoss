import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatOdds } from "@/lib/format";
import type { ParlayEvent, PropLine } from "@/lib/parlay/analysis";
import { PARLAY_PROP_MARKETS } from "@/lib/parlay/client";
import { cn } from "@/lib/utils";

const MAX_ROWS = 40;

export function ResearchProps({
  event,
  market,
  lines,
  query,
  sportKey,
}: {
  event: ParlayEvent;
  market: string | null;
  lines: PropLine[];
  query: string;
  sportKey: string;
}) {
  const base = `/analysis/investigar?deporte=${encodeURIComponent(sportKey)}&evento=${encodeURIComponent(event.id)}`;

  if (!market) {
    return (
      <section aria-labelledby="props" className="space-y-2">
        <h2 id="props" className="text-sm font-semibold">
          Props de jugador
        </h2>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Elige un mercado para ver la mejor cuota de Over y Under entre las
          casas que lo cotizan.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PARLAY_PROP_MARKETS.map(([key, label]) => (
            <Link
              key={key}
              href={`${base}&mercado=${key}`}
              className="flex h-9 items-center rounded-full border bg-background px-3 text-xs font-medium text-muted-foreground active:bg-muted"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
    );
  }

  const label =
    PARLAY_PROP_MARKETS.find(([key]) => key === market)?.[1] ?? market;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? lines.filter((line) =>
        line.player.toLowerCase().includes(normalizedQuery),
      )
    : lines;
  const visible = filtered.slice(0, MAX_ROWS);

  return (
    <section aria-labelledby="props" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="props" className="text-sm font-semibold">
          Props · {label}
        </h2>
        <span className="text-[10px] text-muted-foreground">
          {lines.length} líneas
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PARLAY_PROP_MARKETS.map(([key, name]) => {
          const active = key === market;
          return (
            <Link
              key={key}
              href={`${base}&mercado=${key}`}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex h-9 items-center rounded-full border px-3 text-xs font-medium active:bg-muted",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background text-muted-foreground",
              )}
            >
              {name}
            </Link>
          );
        })}
      </div>

      <form action="/analysis/investigar" method="get" className="flex gap-1.5">
        <input type="hidden" name="deporte" value={sportKey} />
        <input type="hidden" name="evento" value={event.id} />
        <input type="hidden" name="mercado" value={market} />
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="jugador"
            defaultValue={query}
            placeholder="Filtrar jugador"
            aria-label="Filtrar jugador"
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-9 text-xs">
          Filtrar
        </Button>
      </form>

      {visible.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {lines.length === 0
            ? "Ninguna casa cotizó este mercado para el partido."
            : "Sin jugadores que coincidan con el filtro."}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border">
          {visible.map((line) => (
            <li
              key={`${line.player}-${line.line}`}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium">
                  {line.player}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  Línea {line.line}
                </p>
              </div>
              <div className="flex shrink-0 gap-3 text-right text-[10px]">
                <div>
                  <p className="text-muted-foreground">Over</p>
                  <p className="font-semibold tabular-nums">
                    {line.over ? formatOdds(line.over.price) : "—"}
                  </p>
                  <p className="max-w-20 truncate text-muted-foreground">
                    {line.over?.book ?? ""}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Under</p>
                  <p className="font-semibold tabular-nums">
                    {line.under ? formatOdds(line.under.price) : "—"}
                  </p>
                  <p className="max-w-20 truncate text-muted-foreground">
                    {line.under?.book ?? ""}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > visible.length && (
        <p className="text-[10px] text-muted-foreground">
          Mostrando {visible.length} de {filtered.length}. Filtra por jugador
          para ver el resto.
        </p>
      )}
    </section>
  );
}
