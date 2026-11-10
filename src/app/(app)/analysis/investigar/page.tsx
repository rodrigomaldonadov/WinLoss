import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Telescope } from "lucide-react";

import { auth } from "@/auth";
import { AnalysisTabs } from "@/components/analysis/analysis-tabs";
import { ResearchArbitrage } from "@/components/analysis/research-arbitrage";
import { ResearchHelpButton } from "@/components/analysis/research-help";
import { ResearchMoneyline } from "@/components/analysis/research-moneyline";
import { ResearchPropsSection } from "@/components/analysis/research-props-section";
import { ResearchPropsSkeleton } from "@/components/analysis/research-props-skeleton";
import { ResearchSummary } from "@/components/analysis/research-summary";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { getUserPreferences } from "@/lib/data/user";
import { formatDateTime } from "@/lib/format";
import {
  PARLAY_PROP_MARKETS,
  type ParlayPropMarket,
} from "@/lib/parlay/analysis";
import { getParlayGames } from "@/lib/parlay/client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Investigar",
};

const SPORTS = [
  { key: "basketball_nba", label: "NBA" },
  { key: "baseball_mlb", label: "MLB" },
  { key: "americanfootball_nfl", label: "NFL" },
  { key: "icehockey_nhl", label: "NHL" },
  { key: "soccer_epl", label: "EPL" },
  { key: "soccer_uefa_champs_league", label: "Champions" },
  { key: "mma_mixed_martial_arts", label: "MMA" },
  { key: "tennis_atp", label: "ATP" },
] as const;

const SPORT_KEYS = new Set<string>(SPORTS.map((sport) => sport.key));
const MAX_GAMES = 14;

type ResearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResearchPage({ searchParams }: ResearchPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const requestedSport = firstParam(params.deporte);
  const sportKey =
    requestedSport && SPORT_KEYS.has(requestedSport)
      ? requestedSport
      : "basketball_nba";
  const eventId = firstParam(params.evento);
  const marketParam = firstParam(params.mercado);
  const market =
    marketParam && PARLAY_PROP_MARKETS.some(([key]) => key === marketParam)
      ? (marketParam as ParlayPropMarket)
      : null;

  const [games, preferences] = await Promise.all([
    getParlayGames(sportKey),
    getUserPreferences(session.user.id),
  ]);

  const selected =
    games?.find((event) => event.id === eventId) ??
    games?.[0] ??
    null;

  const sportLabel =
    SPORTS.find((sport) => sport.key === sportKey)?.label ?? sportKey;

  return (
    <div className="space-y-2">
      <PageHeader
        className="pb-0 [&>div]:space-y-0 [&_h1]:text-xl md:[&_h1]:text-2xl [&_p]:text-xs"
        title="Investigar"
        description="Elige un partido y mira quién es favorito, la mejor cuota y si hay arbitraje."
        action={<ResearchHelpButton />}
      />
      <AnalysisTabs active="research" />

      <nav
        aria-label="Deporte"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SPORTS.map((sport) => {
          const active = sport.key === sportKey;
          return (
            <Link
              key={sport.key}
              href={`/analysis/investigar?deporte=${sport.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-medium",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background text-muted-foreground active:bg-muted",
              )}
            >
              {sport.label}
            </Link>
          );
        })}
      </nav>

      {games === null ? (
        <EmptyState
          icon={Telescope}
          title="No pudimos consultar ParlayAPI"
          description="Revisa que PARLAY_API_KEY esté configurada en el servidor y que la cuota de consultas no esté agotada."
        />
      ) : games.length === 0 || !selected ? (
        <EmptyState
          icon={Telescope}
          title="Sin partidos próximos"
          description={`ParlayAPI no devolvió partidos de ${sportLabel} ahora mismo.`}
        />
      ) : (
        <>
          <nav
            aria-label="Partidos"
            className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {games.slice(0, MAX_GAMES).map((event) => {
              const active = event.id === selected.id;
              return (
                <Link
                  key={event.id}
                  href={`/analysis/investigar?deporte=${sportKey}&evento=${event.id}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex min-w-0 shrink-0 flex-col justify-center rounded-lg border px-2.5 py-1.5 text-left",
                    active
                      ? "border-primary bg-primary/10"
                      : "bg-background active:bg-muted",
                  )}
                >
                  <span className="max-w-44 truncate text-[11px] font-medium">
                    {event.home_team} vs {event.away_team}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {formatDateTime(event.commence_time, preferences.timezone)}
                  </span>
                </Link>
              );
            })}
          </nav>

          <section className="rounded-lg border bg-card px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold leading-tight">
                  {selected.home_team}{" "}
                  <span className="font-normal text-muted-foreground">
                    vs
                  </span>{" "}
                  {selected.away_team}
                </h2>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {selected.sport_title ?? sportLabel} ·{" "}
                  {formatDateTime(selected.commence_time, preferences.timezone)}
                </p>
              </div>
              <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[9px]">
                {selected.bookmakers.length} casas
              </Badge>
            </div>
          </section>

          <ResearchSummary event={selected} />
          <ResearchMoneyline event={selected} />
          <ResearchArbitrage event={selected} />
          <Suspense fallback={<ResearchPropsSkeleton />}>
            <ResearchPropsSection
              event={selected}
              market={market}
              sportKey={sportKey}
            />
          </Suspense>

          <details className="rounded-xl border bg-muted/10 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-medium">
              Cómo se calculan estos números y qué falta
            </summary>
            <ul className="mt-2 space-y-1 text-[10px] leading-snug text-muted-foreground">
              <li>
                <strong className="text-foreground">Pinnacle no está</strong> en
                el catálogo de ParlayAPI (la API devuelve UNKNOWN_BOOKMAKER). La
                referencia es Novig y, si falta, ProphetX.
              </li>
              <li>
                <strong className="text-foreground">Polymarket y Kalshi</strong>{" "}
                cotizan contratos de evento y futuros, no el moneyline de este
                partido; por eso no hay comparación de predicción.
              </li>
              <li>
                <strong className="text-foreground">Movimiento</strong>: la API
                no expone <code>odds-history</code>; el archivo
                <code> /v1/historical/…</code> está limitado a 48 h en el plan
                actual, así que no hay serie intradía que mostrar.
              </li>
              <li>
                <strong className="text-foreground">Novig y ProphetX</strong>{" "}
                son exchanges: sus cuotas pueden tener poca liquidez. Se citan
                con su casa, sin suavizarlas.
              </li>
              <li>
                Datos de ParlayAPI. Si una casa no cotizó un mercado, no
                aparece: no se rellenan cuotas.
              </li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
