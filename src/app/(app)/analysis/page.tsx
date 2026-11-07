import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Plus } from "lucide-react";

import { auth } from "@/auth";
import { AnalysisCard, NoAnalysisCard } from "@/components/analysis/analysis-card";
import { AnalysisFilters } from "@/components/analysis/analysis-filters";
import { AnalysisHelpButton } from "@/components/analysis/analysis-help";
import { AnalysisTabs } from "@/components/analysis/analysis-tabs";
import { DataStatusNotice } from "@/components/analysis/data-status";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  ANALYSIS_DAY_OPTIONS,
  competitionKey,
  type AnalysisDays,
} from "@/lib/analysis/view";
import { getAnalysisFeed } from "@/lib/data/analysis";
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

export default async function AnalysisPage({ searchParams }: AnalysisPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const days = parseDays(params.dias);
  const selected = parseCompetitions(params.competicion);

  const [items, preferences, dataStatus] = await Promise.all([
    getAnalysisFeed(session.user.id, { days }),
    getUserPreferences(session.user.id),
    getAnalysisDataStatus(),
  ]);

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

  return (
    <div className="space-y-1.5">
      <PageHeader
        className="pb-0 [&>div]:space-y-0 [&_h1]:text-xl md:[&_h1]:text-2xl [&_p]:text-xs"
        title="Consenso"
        description={`Próximos ${days} días.`}
        action={
          <div className="flex items-center gap-0.5">
            <AnalysisHelpButton />
            <Button asChild size="icon" className="size-8" aria-label="Registrar apuesta">
              <Link href="/bets/new">
                <Plus className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        }
      />

      <AnalysisTabs active="upcoming" />

      <AnalysisFilters
        days={days}
        selected={selected}
        competitions={competitions}
      />

      <DataStatusNotice
        status={dataStatus}
        timeZone={preferences.timezone}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Sin partidos próximos"
          description="Cuando haya fixtures y análisis, aparecerán aquí."
          action={
            <Button asChild>
              <Link href="/bets/new">Registrar apuesta</Link>
            </Button>
          }
        />
      ) : (
        <>
          {analyzed.length > 0 && (
            <div className="grid gap-1.5">
              {analyzed.map((item) => (
                <AnalysisCard
                  key={item.id}
                  item={item}
                  timeZone={preferences.timezone}
                />
              ))}
            </div>
          )}

          {unavailable.length > 0 && (
            <section aria-labelledby="sin-analisis" className="space-y-1">
              <h2
                id="sin-analisis"
                className="text-[10px] font-semibold text-muted-foreground"
              >
                Sin análisis disponible
              </h2>
              <div className="grid gap-1.5">
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
        </>
      )}
    </div>
  );
}
