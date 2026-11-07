import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Info, Plus } from "lucide-react";

import { auth } from "@/auth";
import { AnalysisCard, NoAnalysisCard } from "@/components/analysis/analysis-card";
import { AnalysisFilters } from "@/components/analysis/analysis-filters";
import { DataStatusNotice } from "@/components/analysis/data-status";
import { ModelAccuracyPanel } from "@/components/analysis/model-accuracy-panel";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MODEL_MARKET_CAVEAT } from "@/lib/analysis/constants";
import {
  ANALYSIS_DAY_OPTIONS,
  analysisHref,
  competitionKey,
  type AnalysisDays,
} from "@/lib/analysis/view";
import { getAnalysisFeed, getModelAccuracy } from "@/lib/data/analysis";
import { getForwardAccuracy } from "@/lib/data/analysis-forward";
import { getAnalysisDataStatus } from "@/lib/data/analysis-status";
import { getUserPreferences } from "@/lib/data/user";

export const metadata: Metadata = {
  title: "Consenso",
};

type AnalysisPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDays(value?: string | string[]): AnalysisDays {
  const parsed = Number(firstParam(value));
  return ANALYSIS_DAY_OPTIONS.includes(parsed as AnalysisDays)
    ? (parsed as AnalysisDays)
    : 7;
}

function parseCompetitions(value?: string | string[]): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))];
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const days = parseDays(params.dias);
  const selected = parseCompetitions(params.competicion);

  const [items, preferences, dataStatus, forward] = await Promise.all([
    getAnalysisFeed(session.user.id, { days }),
    getUserPreferences(session.user.id),
    getAnalysisDataStatus(),
    getForwardAccuracy(),
  ]);
  const accuracy = getModelAccuracy();

  const options = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    const key = competitionKey(item);
    const current = options.get(key);
    options.set(key, {
      label: item.competition,
      count: (current?.count ?? 0) + 1,
    });
  }
  const competitions = [...options.entries()]
    .map(([key, option]) => ({ key, ...option }))
    .sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"),
    );

  const selectedSet = new Set(selected);
  const visible =
    selected.length === 0
      ? items
      : items.filter((item) => selectedSet.has(competitionKey(item)));

  const analyzed = visible.filter(
    (item) => item.final.available && Boolean(item.final.probabilities),
  );
  const unavailable = visible.filter(
    (item) => !item.final.available || !item.final.probabilities,
  );
  const marketCount = visible.filter(
    (item) => item.sources.market.available,
  ).length;
  const modelCount = visible.filter(
    (item) => item.final.source === "model",
  ).length;
  const hasMarket = items.some((item) => item.sources.market.available);

  return (
    <div className="space-y-4">
      <PageHeader
        className="pb-0"
        title="Consenso"
        description={`Probabilidades y comparación de fuentes para los próximos ${days} días.`}
        action={
          <Button asChild size="icon" aria-label="Registrar apuesta">
            <Link href="/bets/new">
              <Plus className="size-5" aria-hidden />
            </Link>
          </Button>
        }
      />

      <div
        role="note"
        className="flex items-start gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-xs leading-snug text-muted-foreground"
      >
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          El mercado es la referencia principal cuando hay cuotas. El modelo y
          la comunidad se muestran aparte para comparar; no se combinan en una
          sola cifra.{" "}
          <span className="font-medium text-foreground">
            {MODEL_MARKET_CAVEAT}.
          </span>
        </p>
      </div>

      <details className="rounded-xl border bg-card px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium">
          Cómo leer esta pantalla
        </summary>
        <ul className="mt-2 list-inside list-disc space-y-1 text-[11px] leading-snug text-muted-foreground">
          <li>
            <strong className="text-foreground">Mercado:</strong> promedio de
            cierre sin margen. Es la fuente principal cuando las cuotas están
            frescas.
          </li>
          <li>
            <strong className="text-foreground">Modelo:</strong> estimación
            estadística de la liga. Se muestra como comparación; en pruebas el
            mercado tuvo mejor Brier.
          </li>
          <li>
            <strong className="text-foreground">Comunidad:</strong> agregado
            anónimo de picks, solo con 5 usuarios distintos o más.
          </li>
          <li>
            <strong className="text-foreground">Confianza:</strong> alta cuando
            hay cuotas de mercado frescas; baja cuando solo hay modelo o la
            muestra es corta; sin datos cuando no hay base suficiente.
          </li>
          <li>
            Tocar un mercado precarga esa selección en{" "}
            <strong className="text-foreground">Nueva apuesta</strong>, sin
            cuota. Tocar el partido precarga solo evento, competición y fecha.
          </li>
          <li>
            La cuota justa es 1 / probabilidad. El comparador no es una
            recomendación ni predice el retorno.
          </li>
        </ul>
      </details>

      <AnalysisFilters
        days={days}
        selected={selected}
        competitions={competitions}
      />

      <DataStatusNotice
        status={dataStatus}
        timeZone={preferences.timezone}
      />

      <ModelAccuracyPanel accuracy={accuracy} forward={forward} />

      {items.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={`Sin partidos analizados para los próximos ${days} días`}
          description="Cuando se importen fixtures y se genere el análisis, aquí verás el mercado, el modelo y las fuentes disponibles. No mostramos probabilidades inventadas."
          action={
            <Button asChild>
              <Link href="/bets/new">Registrar apuesta</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section
            aria-label="Resumen del análisis"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            <Stat label="Partidos" value={visible.length} />
            <Stat label="Con mercado" value={marketCount} />
            <Stat label="Solo modelo" value={modelCount} />
            <Stat label="Sin análisis" value={unavailable.length} />
          </section>

          {selected.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Mostrando{" "}
              <strong className="text-foreground">{selected.length}</strong>{" "}
              competiciones de {competitions.length}.{" "}
              <Link
                href={analysisHref({ days, competitions: [] })}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Ver todas
              </Link>
            </p>
          )}

          {analyzed.length > 0 ? (
            <section aria-labelledby="con-analisis">
              <div className="mb-2 flex items-end justify-between gap-2">
                <h2
                  id="con-analisis"
                  className="text-sm font-semibold tracking-tight"
                >
                  Con análisis
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {analyzed.length} partidos
                </span>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {analyzed.map((item) => (
                  <AnalysisCard
                    key={item.id}
                    item={item}
                    timeZone={preferences.timezone}
                  />
                ))}
              </div>
            </section>
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              Ningún partido de la selección tiene datos suficientes para
              estimar probabilidades.
            </div>
          )}

          {unavailable.length > 0 && (
            <section aria-labelledby="sin-analisis">
              <div className="mb-2 flex items-end justify-between gap-2">
                <div>
                  <h2
                    id="sin-analisis"
                    className="text-sm font-semibold tracking-tight"
                  >
                    Sin análisis disponible
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Partidos sin cuotas ni muestra suficiente. No mostramos
                    probabilidades para no inventar datos.
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {unavailable.length} partidos
                </span>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {unavailable.map((item) => (
                  <NoAnalysisCard
                    key={item.id}
                    item={item}
                    timeZone={preferences.timezone}
                  />
                ))}
              </div>
            </section>
          )}

          {!hasMarket && (
            <p className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
              Ahora mismo no hay cuotas de mercado importadas. Las tarjetas
              muestran solo la estimación del modelo, con confianza baja, y no
              hay una probabilidad de mercado que comparar.
            </p>
          )}
        </>
      )}

      <p className="pb-2 text-center text-[10px] leading-snug text-muted-foreground">
        Las probabilidades son estimaciones estadísticas y no garantizan el
        resultado. La comunidad solo se agrega con 5 usuarios distintos o más.
      </p>
    </div>
  );
}
