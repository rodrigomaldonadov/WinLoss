import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { History } from "lucide-react";

import { auth } from "@/auth";
import { AnalysisTabs } from "@/components/analysis/analysis-tabs";
import { HistoryFilters } from "@/components/analysis/history-filters";
import { HistoryRow } from "@/components/analysis/history-row";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  historyHref,
  historyPresets,
  parseHistoryFilters,
} from "@/lib/analysis/history";
import {
  getAnalysisHistory,
  getHistoryCompetitions,
} from "@/lib/data/analysis-history";
import { getUserPreferences } from "@/lib/data/user";

export const metadata: Metadata = {
  title: "Historial de análisis",
};

type AnalysisHistoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AnalysisHistoryPage({
  searchParams,
}: AnalysisHistoryPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const filters = parseHistoryFilters(params);
  const preferences = await getUserPreferences(session.user.id);

  const [result, competitions] = await Promise.all([
    getAnalysisHistory({
      userId: session.user.id,
      filters,
      timeZone: preferences.timezone,
    }),
    getHistoryCompetitions(),
  ]);

  const presets = historyPresets(filters, new Date(), preferences.timezone);
  const hasFilters =
    Boolean(filters.query) ||
    filters.competitions.length > 0 ||
    Boolean(filters.from || filters.to) ||
    filters.mode !== "all" ||
    filters.mine;

  const description =
    result.total === 0
      ? "Partidos jugados y qué decía el análisis antes del inicio."
      : `${result.total} ${
          result.total === 1 ? "partido jugado" : "partidos jugados"
        } · más recientes primero`;

  const emptyState = result.unknownTeam
    ? {
        title: "No encontramos ese equipo",
        description:
          "Revisa el nombre o prueba con el alias que usa la app. También puedes filtrar por competición y fechas.",
        action: (
          <Button asChild variant="outline">
            <Link href={historyHref({ ...filters, query: "", page: 1 })}>
              Quitar búsqueda
            </Link>
          </Button>
        ),
      }
    : filters.mine
      ? {
          title: "Sin partidos con tus apuestas",
          description:
            "Cuando registres picks desde Consenso, aparecerán aquí cruzados con el resultado.",
          action: (
            <Button asChild variant="outline">
              <Link href={historyHref({ ...filters, mine: false, page: 1 })}>
                Ver todos los partidos
              </Link>
            </Button>
          ),
        }
      : hasFilters
        ? {
            title: "No hay partidos con estos filtros",
            description:
              "Prueba con otro rango de fechas, otra competición o quita la búsqueda.",
            action: (
              <Button asChild variant="outline">
                <Link href="/analysis/historial">Limpiar filtros</Link>
              </Button>
            ),
          }
        : {
            title: "Todavía no hay partidos jugados",
            description:
              "Cuando se importen resultados, aparecerán aquí con la captura del análisis previa al inicio.",
            action: (
              <Button asChild>
                <Link href="/analysis">Ver próximos partidos</Link>
              </Button>
            ),
          };

  return (
    <div className="space-y-1.5">
      <PageHeader
        className="pb-0 [&>div]:space-y-0 [&_h1]:text-xl md:[&_h1]:text-2xl [&_p]:text-xs"
        title="Historial"
        description={description}
      />

      <AnalysisTabs active="history" />

      <HistoryFilters
        filters={filters}
        competitions={competitions}
        matchedTeams={result.matchedTeams}
        presets={presets}
      />

      {result.items.length === 0 ? (
        <EmptyState
          icon={History}
          title={emptyState.title}
          description={emptyState.description}
          action={emptyState.action}
        />
      ) : (
        <>
          <ul className="grid gap-1.5" aria-label="Partidos jugados">
            {result.items.map((item) => (
              <li key={item.id}>
                <HistoryRow item={item} timeZone={preferences.timezone} />
              </li>
            ))}
          </ul>

          {result.totalPages > 1 && (
            <nav
              aria-label="Paginación del historial"
              className="flex items-center justify-between gap-2 pt-1"
            >
              {result.page > 1 ? (
                <Button asChild variant="outline" className="h-11 flex-1">
                  <Link
                    href={historyHref({ ...filters, page: result.page - 1 })}
                  >
                    ← Anterior
                  </Link>
                </Button>
              ) : (
                <span className="flex-1" />
              )}
              <p className="text-xs text-muted-foreground tabular-nums">
                Página {result.page} de {result.totalPages}
              </p>
              {result.page < result.totalPages ? (
                <Button asChild variant="outline" className="h-11 flex-1">
                  <Link
                    href={historyHref({ ...filters, page: result.page + 1 })}
                  >
                    Siguiente →
                  </Link>
                </Button>
              ) : (
                <span className="flex-1" />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
