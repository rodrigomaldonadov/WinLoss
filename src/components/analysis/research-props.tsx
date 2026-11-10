"use client";

import { useRef, useState } from "react";
import { Search } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { loadResearchProps } from "@/lib/actions/research";
import { formatOdds } from "@/lib/format";
import {
  PARLAY_PROP_MARKETS,
  type ParlayPropMarket,
  type PropLine,
} from "@/lib/parlay/analysis";
import { cn } from "@/lib/utils";

const MAX_ROWS = 40;

export function ResearchProps({
  eventId,
  homeTeam,
  awayTeam,
  sportKey,
  initialMarket,
  initialLines,
}: {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  sportKey: string;
  initialMarket: ParlayPropMarket | null;
  initialLines: PropLine[];
}) {
  const [market, setMarket] = useState<ParlayPropMarket | null>(initialMarket);
  const [lines, setLines] = useState<PropLine[]>(initialLines);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const request = useRef(0);

  const selectMarket = async (key: ParlayPropMarket) => {
    if (key === market && !loading) return;

    const id = request.current + 1;
    request.current = id;
    setMarket(key);
    setLoading(true);
    setError(null);
    setQuery("");

    const url = new URL(window.location.href);
    url.searchParams.set("mercado", key);
    window.history.replaceState(null, "", url.toString());

    try {
      const result = await loadResearchProps({
        sportKey,
        eventId,
        market: key,
        homeTeam,
        awayTeam,
      });
      if (request.current !== id) return;
      if (result.ok) {
        setLines(result.lines);
      } else {
        setLines([]);
        setError(result.error);
      }
    } catch {
      if (request.current === id) {
        setLines([]);
        setError("No pudimos cargar las cuotas.");
      }
    } finally {
      if (request.current === id) setLoading(false);
    }
  };

  const label = market
    ? (PARLAY_PROP_MARKETS.find(([key]) => key === market)?.[1] ?? market)
    : null;
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
          {market ? `Mejor cuota · ${label}` : "Mejor cuota por jugador"}
        </h2>
        {market && (
          <span className="text-[10px] text-muted-foreground">
            {loading ? "cargando…" : `${lines.length} líneas`}
          </span>
        )}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        {market
          ? "Elige otro mercado o busca al jugador. Verás la mejor casa para Más y para Menos."
          : "Elige el mercado y busca al jugador. Verás la mejor casa para Más y para Menos."}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {PARLAY_PROP_MARKETS.map(([key, name]) => {
          const active = key === market;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => selectMarket(key)}
              className={cn(
                "flex h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors active:bg-muted",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background text-muted-foreground",
              )}
            >
              {name}
            </button>
          );
        })}
      </div>

      {market && (
        <>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar jugador"
              aria-label="Buscar jugador"
              className="h-9 pl-8 text-xs"
            />
          </div>

          {loading ? (
            <div
              className="space-y-1.5"
              aria-busy="true"
              aria-label="Cargando mejores cuotas"
            >
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-lg border bg-card px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">{error}</p>
              <button
                type="button"
                onClick={() => selectMarket(market)}
                className="mt-2 text-[11px] font-medium text-primary underline-offset-4 hover:underline"
              >
                Reintentar
              </button>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {lines.length === 0
                ? "Ninguna casa cotizó este mercado para el partido."
                : "Sin jugadores que coincidan con la búsqueda."}
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
                      <p className="text-muted-foreground">Más</p>
                      <p className="font-semibold tabular-nums">
                        {line.over ? formatOdds(line.over.price) : "—"}
                      </p>
                      <p className="max-w-20 truncate text-muted-foreground">
                        {line.over?.book ?? ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Menos</p>
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

          {!loading && filtered.length > visible.length && (
            <p className="text-[10px] text-muted-foreground">
              Mostrando {visible.length} de {filtered.length}. Busca por jugador
              para ver el resto.
            </p>
          )}
        </>
      )}
    </section>
  );
}
