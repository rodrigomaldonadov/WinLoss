import {
  ArrowLeft,
  CalendarDays,
  History,
  Info,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";

import {
  FairOddsComparator,
  ProbabilityGrid,
  ProbabilityHeadline,
  TotalsLine,
} from "@/components/analysis/probability-panel";
import { AnalysisHelpButton } from "@/components/analysis/analysis-help";
import { DataStatusDetails } from "@/components/analysis/data-status";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MODEL_MARKET_CAVEAT } from "@/lib/analysis/constants";
import type { AnalysisSourceKey } from "@/lib/analysis/engine";
import {
  analysisBetHref,
  confidenceLabel,
  type AnalysisDetail,
  type AnalysisH2H,
  type AnalysisPrivateLeg,
  type AnalysisTeamForm,
} from "@/lib/analysis/view";
import type { AnalysisDataStatus } from "@/lib/data/analysis-status";
import { formatDate, formatDateTime, formatOdds } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  WON: "Ganada",
  LOST: "Perdida",
  VOID: "Nula",
  HALF_WON: "Media ganada",
  HALF_LOST: "Media perdida",
  CASHOUT: "Cash out",
};

function SourceCard({
  source,
}: {
  source: AnalysisDetail["sources"][AnalysisSourceKey];
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{source.label}</p>
        <Badge variant={source.available ? "secondary" : "outline"}>
          {source.available ? confidenceLabel(source.confidence) : "Sin datos"}
        </Badge>
      </div>

      {source.probabilities ? (
        <ProbabilityGrid probabilities={source.probabilities} className="mt-2" />
      ) : null}
      <TotalsLine totals={source.totals} />

      <p className="mt-2 text-[0.6875rem] leading-snug text-muted-foreground">
        {source.note}
      </p>
      {source.sample !== null && (
        <p className="mt-1 text-[0.625rem] text-muted-foreground">
          Muestra: {source.sample}
          {source.key === "community" ? " usuarios" : ""}
          {source.key === "private" ? " picks" : ""}
        </p>
      )}
    </div>
  );
}

function FormCard({ form }: { form: AnalysisTeamForm }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{form.teamName}</p>
        <p className="text-[0.625rem] text-muted-foreground">
          {form.summary.played} partidos
        </p>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        <strong className="text-foreground">{form.summary.wins}V</strong> ·{" "}
        {form.summary.draws}E · {form.summary.losses}D ·{" "}
        {form.summary.goalsFor}-{form.summary.goalsAgainst} goles
      </p>

      {form.matches.length > 0 ? (
        <ul className="mt-2 divide-y text-[0.6875rem]">
          {form.matches.map((match) => (
            <li
              key={match.id}
              className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0"
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded text-[0.625rem] font-semibold",
                  match.result === "W" && "bg-emerald-500/10 text-emerald-700",
                  match.result === "D" && "bg-muted text-muted-foreground",
                  match.result === "L" && "bg-rose-500/10 text-rose-700",
                )}
              >
                {match.result}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground">
                  {match.venue === "home" ? "vs" : "@"}
                </span>{" "}
                {match.opponent}
              </span>
              <span className="font-medium tabular-nums">
                {match.goalsFor}-{match.goalsAgainst}
              </span>
              <time
                dateTime={match.playedAt.toISOString()}
                className="w-14 shrink-0 text-right text-muted-foreground"
              >
                {formatDate(match.playedAt)}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[0.6875rem] text-muted-foreground">
          Sin partidos previos en la base histórica.
        </p>
      )}
    </div>
  );
}

function H2HCard({
  h2h,
  homeName,
  awayName,
}: {
  h2h: AnalysisH2H;
  homeName: string;
  awayName: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">Historial directo</p>
        <p className="text-[0.625rem] text-muted-foreground">
          {h2h.summary.played} partidos
        </p>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        <strong className="text-foreground">{homeName}</strong>{" "}
        {h2h.summary.homeWins} · Empates {h2h.summary.draws} ·{" "}
        <strong className="text-foreground">{awayName}</strong>{" "}
        {h2h.summary.awayWins}
      </p>

      {h2h.matches.length > 0 ? (
        <ul className="mt-2 divide-y text-[0.6875rem]">
          {h2h.matches.map((match) => (
            <li
              key={match.id}
              className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0"
            >
              <time
                dateTime={match.playedAt.toISOString()}
                className="w-14 shrink-0 text-muted-foreground"
              >
                {formatDate(match.playedAt)}
              </time>
              <span className="min-w-0 flex-1 truncate">
                {match.homeName} <span className="text-muted-foreground">vs</span>{" "}
                {match.awayName}
              </span>
              <span className="font-medium tabular-nums">
                {match.homeGoals}-{match.awayGoals}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[0.6875rem] text-muted-foreground">
          Sin enfrentamientos previos en la base histórica.
        </p>
      )}
    </div>
  );
}

function PrivateLegRow({
  leg,
  timeZone,
}: {
  leg: AnalysisPrivateLeg;
  timeZone?: string;
}) {
  return (
    <li className="rounded-lg border bg-card p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{leg.eventName}</p>
          <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
            {leg.eventDate
              ? formatDateTime(leg.eventDate, timeZone)
              : "Sin fecha"}{" "}
            · Cuota {formatOdds(leg.odds)}
          </p>
        </div>
        <Badge variant="outline">
          {STATUS_LABEL[leg.status] ?? leg.status}
        </Badge>
      </div>

      {leg.selections.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[0.6875rem] text-muted-foreground">
          {leg.selections.map((selection) => (
            <li key={selection.id}>
              {selection.market}: {selection.selection}
              {selection.line !== null ? ` (${selection.line})` : ""}
              {selection.pick ? ` · ${selection.pick}` : ""}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function QualityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-1.5 last:border-0">
      <dt className="text-[0.6875rem] text-muted-foreground">{label}</dt>
      <dd className="text-right text-[0.6875rem] font-medium">{value}</dd>
    </div>
  );
}

function brierLabel(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value.toFixed(3)
    : "—";
}

export function AnalysisDetailView({
  detail,
  timeZone,
  dataStatus,
}: {
  detail: AnalysisDetail;
  timeZone?: string;
  dataStatus: AnalysisDataStatus;
}) {
  const sources = Object.values(detail.sources).filter(
    (source) => source.key !== "private",
  );
  const hasFinal = detail.final.available && detail.final.probabilities;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/analysis">
          <ArrowLeft className="size-4" aria-hidden />
          Volver a Consenso
        </Link>
      </Button>

      <PageHeader
        className="pb-0"
        title={`${detail.homeName} vs ${detail.awayName}`}
        description={`${detail.competition} · ${formatDateTime(
          detail.kickoff,
          timeZone,
        )}`}
        action={
          <div className="flex items-center gap-1">
            <AnalysisHelpButton />
            <Button asChild size="sm">
              <Link href={analysisBetHref(detail)}>Registrar apuesta</Link>
            </Button>
          </div>
        }
      />

      <section aria-labelledby="probabilidades">
        <h2
          id="probabilidades"
          className="mb-2 text-sm font-semibold tracking-tight"
        >
          Probabilidades
        </h2>

        <Card size="sm">
          <CardContent className="pt-0">
            {hasFinal ? (
              <ProbabilityHeadline item={detail} />
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-3">
                <Badge variant="outline">Sin datos suficientes</Badge>
                <p className="mt-2 text-sm font-medium">
                  No hay cuotas de mercado ni muestra suficiente para estimar
                  probabilidades.
                </p>
                <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                  {detail.sources.model.note}
                </p>
              </div>
            )}
            <FairOddsComparator item={detail} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="fuentes">
        <h2
          id="fuentes"
          className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight"
        >
          <Users className="size-4" aria-hidden />
          Fuentes
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {sources.map((source) => (
            <SourceCard key={source.key} source={source} />
          ))}
        </div>
        <p className="mt-2 text-[0.625rem] leading-snug text-muted-foreground">
          El mercado es la fuente principal cuando hay cuotas. El modelo y la
          comunidad se muestran como comparación, sin combinarse en una sola
          cifra.{" "}
          {MODEL_MARKET_CAVEAT}.
        </p>
      </section>

      <details className="rounded-xl border bg-card p-3">
        <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold tracking-tight">
          <History className="size-4" aria-hidden />
          Forma reciente y H2H
        </summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <FormCard form={detail.form.home} />
          <FormCard form={detail.form.away} />
        </div>
        <div className="mt-2">
          <H2HCard
            h2h={detail.h2h}
            homeName={detail.homeName}
            awayName={detail.awayName}
          />
        </div>
      </details>

      <details className="rounded-xl border bg-card p-3">
        <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold tracking-tight">
          <ShieldCheck className="size-4" aria-hidden />
          Tu historial
        </summary>

        <div className="mt-3">
          {detail.sources.private.probabilities ? (
            <SourceCard source={detail.sources.private} />
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                {detail.sources.private.note}
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link href={analysisBetHref(detail)}>Registrar apuesta</Link>
              </Button>
            </div>
          )}

          {detail.privateLegs.length > 0 && (
            <ul className="mt-2 space-y-2">
              {detail.privateLegs.map((leg) => (
                <PrivateLegRow key={leg.id} leg={leg} timeZone={timeZone} />
              ))}
            </ul>
          )}

          <p className="mt-2 text-[0.625rem] leading-snug text-muted-foreground">
            Tu historial solo lo ves tú. La comunidad se agrega de forma anónima
            y solo aparece con al menos 5 usuarios distintos.
          </p>
        </div>
      </details>

      <section aria-labelledby="calidad">
        <h2
          id="calidad"
          className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight"
        >
          <Info className="size-4" aria-hidden />
          Calidad de datos
        </h2>

        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle className="text-sm">Trazabilidad del análisis</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <dl>
              <QualityRow
                label="Análisis generado"
                value={
                  detail.quality.generatedAt
                    ? formatDateTime(detail.quality.generatedAt, timeZone)
                    : "—"
                }
              />
              <QualityRow
                label="Cuotas capturadas"
                value={
                  detail.quality.marketCapturedAt
                    ? formatDateTime(detail.quality.marketCapturedAt, timeZone)
                    : "—"
                }
              />
              <QualityRow
                label="Estado de las cuotas"
                value={
                  detail.sources.market.available
                    ? detail.quality.marketFresh
                      ? "Vigentes"
                      : "Sin cuotas vigentes"
                    : "Sin cuotas"
                }
              />
              <QualityRow
                label="Muestra del modelo"
                value={
                  detail.quality.modelSample === null
                    ? "—"
                    : `${detail.quality.modelSample} partidos`
                }
              />
              <QualityRow
                label="Filas de origen"
                value={detail.quality.sourcesUsed.join(", ") || "—"}
              />
              <QualityRow
                label="Fixtures emparejados"
                value={String(detail.quality.fixtureIds.length)}
              />
              <QualityRow
                label="Backtest"
                value={
                  detail.quality.referenceAsOf
                    ? `${formatDate(detail.quality.referenceAsOf, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })} · N=${detail.reference.sample}`
                    : "—"
                }
              />
            </dl>

            <div className="mt-3 rounded-lg bg-muted/30 px-2.5 py-2 text-[0.6875rem] leading-snug text-muted-foreground">
              <p className="font-medium text-foreground">Baselines</p>
              <p className="mt-0.5">
                Modelo {brierLabel(detail.reference.modelBrier)} · Cierre{" "}
                {brierLabel(detail.reference.marketBrier)} · Pre-cierre{" "}
                {brierLabel(detail.reference.marketPreBrier)} · Ingenua{" "}
                {brierLabel(detail.reference.naiveBrier)}
              </p>
              <p className="mt-1">
                Brier: menor es mejor. El N puede variar por liga y por
                disponibilidad de cuotas pre-cierre; Brasil y Argentina no
                tienen ese subconjunto en el corte actual.
              </p>
            </div>

            {detail.notes.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-1 text-[0.6875rem] text-muted-foreground">
                {detail.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}

            <p className="mt-2 flex items-start gap-1.5 text-[0.625rem] leading-snug text-muted-foreground">
              <CalendarDays className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Las cifras salen del backtest versionado. No se generan
              probabilidades nuevas en la interfaz.
            </p>

            <DataStatusDetails status={dataStatus} timeZone={timeZone} />
          </CardContent>
        </Card>
      </section>

      <p className="flex items-start gap-1.5 pb-2 text-[0.625rem] leading-snug text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Probabilidades estimadas; no son una recomendación.
      </p>
    </div>
  );
}
