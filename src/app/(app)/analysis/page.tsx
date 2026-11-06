import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Info, Plus, Users } from "lucide-react";

import { auth } from "@/auth";
import { ConsensusCard } from "@/components/analysis/consensus-card";
import { HistoryStats } from "@/components/analysis/history-stats";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  getUpcomingConsensus,
  type ConsensusScope,
} from "@/lib/data/consensus";
import { getUserPreferences } from "@/lib/data/user";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Consenso",
};

const DAY_OPTIONS = [3, 7, 14] as const;
type DayOption = (typeof DAY_OPTIONS)[number];

const SCOPES: { value: ConsensusScope; label: string }[] = [
  { value: "community", label: "Comunidad" },
  { value: "mine", label: "Mis picks" },
];

type AnalysisPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDays(value?: string | string[]): DayOption {
  const parsed = Number(firstParam(value));
  return DAY_OPTIONS.includes(parsed as DayOption) ? (parsed as DayOption) : 7;
}

function parseScope(value?: string | string[]): ConsensusScope {
  return firstParam(value) === "mios" ? "mine" : "community";
}

function hrefFor({
  days,
  scope,
}: {
  days: DayOption;
  scope: ConsensusScope;
}): string {
  const params = new URLSearchParams();
  if (days !== 7) params.set("dias", String(days));
  if (scope === "mine") params.set("ambito", "mios");
  const qs = params.toString();
  return qs ? `/analysis?${qs}` : "/analysis";
}

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const days = parseDays(params.dias);
  const scope = parseScope(params.ambito);

  const [consensus, preferences] = await Promise.all([
    getUpcomingConsensus(session.user.id, { scope, days }),
    getUserPreferences(session.user.id),
  ]);

  const hasData = consensus.matches.length > 0;
  const scopeLabel = scope === "mine" ? "tus picks" : "la comunidad";

  return (
    <div className="space-y-4">
      <PageHeader
        className="pb-0"
        title="Consenso"
        description={`Probabilidades estimadas para los próximos ${days} días.`}
        action={
          <Button asChild size="icon" aria-label="Registrar pick">
            <Link href="/bets/new">
              <Plus className="size-5" aria-hidden />
            </Link>
          </Button>
        }
      />

      <div className="flex items-start gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Probabilidad estimada combinando la cuota media de los picks, el
          histórico de resultados y el consenso. Datos agregados y anónimos; no
          es una predicción garantizada.
        </p>
      </div>

      <div className="space-y-2">
        <div
          role="group"
          aria-label="Ámbito del consenso"
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1"
        >
          {SCOPES.map((item) => {
            const active = item.value === scope;
            return (
              <Link
                key={item.value}
                href={hrefFor({ days, scope: item.value })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground active:bg-background/60",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <nav
          aria-label="Periodo de análisis"
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {DAY_OPTIONS.map((option) => {
            const active = option === days;
            return (
              <Link
                key={option}
                href={hrefFor({ days: option, scope })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 shrink-0 items-center justify-center rounded-full border px-3.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground active:bg-muted",
                )}
              >
                {option} días
              </Link>
            );
          })}
        </nav>
      </div>

      <section
        aria-label="Resumen del consenso"
        className="grid grid-cols-3 divide-x rounded-xl border bg-card shadow-xs"
      >
        <div className="px-3 py-2.5 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Partidos
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">
            {consensus.matches.length}
          </p>
        </div>
        <div className="px-3 py-2.5 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Picks
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">
            {consensus.totalPicks}
          </p>
        </div>
        <div className="px-3 py-2.5 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {scope === "mine" ? "Fuente" : "Usuarios"}
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">
            {scope === "mine" ? "Tú" : consensus.totalUsers}
          </p>
        </div>
      </section>

      <HistoryStats stats={consensus.history} scope={scope} />

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title={`Sin picks para ${scopeLabel} en los próximos ${days} días`}
          description={
            scope === "mine"
              ? "Registra un pick con fecha futura o revisa el consenso de la comunidad."
              : "Cuando haya apuestas pendientes con fecha futura, aquí verás qué opciones concentran más picks."
          }
          action={
            <Button asChild>
              <Link href="/bets/new">Registrar apuesta</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {consensus.matches.map((match) => (
            <ConsensusCard
              key={match.key}
              match={match}
              timeZone={preferences.timezone}
            />
          ))}
        </div>
      )}

      {hasData && scope === "community" && consensus.totalUsers < 2 && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <Users className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Todavía hay pocos usuarios con picks próximos; el consenso puede
          coincidir con tus propias apuestas.
        </p>
      )}

      <details className="rounded-xl border bg-card p-4 text-xs shadow-xs">
        <summary className="cursor-pointer font-medium">
          Cómo se calcula la probabilidad
        </summary>
        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
          <li>
            <strong className="text-foreground">Cuota media:</strong>{" "}
            probabilidad implícita (1 / cuota) de las cuotas registradas en los
            picks, normalizada dentro del mercado.
          </li>
          <li>
            <strong className="text-foreground">Histórico:</strong> tasa de
            acierto por tipo de selección (local/empate/visitante, línea,
            etc.), suavizada con un prior bayesiano (k = 5) para no sobreactuar
            con muestras pequeñas.
          </li>
          <li>
            <strong className="text-foreground">Consenso:</strong> porcentaje de
            picks de los usuarios para esa opción.
          </li>
          <li>
            Los pesos crecen con el tamaño de muestra; el histórico solo usa
            legs simples liquidados. Las cuotas son las registradas en la app,
            no un feed externo en vivo.
          </li>
        </ul>
      </details>

      <p className="pb-2 text-center text-[10px] text-muted-foreground">
        Las probabilidades son estimaciones estadísticas, no una garantía del
        resultado.
      </p>
    </div>
  );
}
