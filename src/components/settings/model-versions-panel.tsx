import Link from "next/link";

import {
  promoteModelVersionAction,
  rollbackModelVersionAction,
} from "@/lib/actions/model-version";
import { getModelVersionsOverview } from "@/lib/data/model-versions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

function metric(
  metrics: unknown,
  key: string,
): number | null {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    return null;
  }
  const value = (metrics as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

function param(
  params: unknown,
  key: string,
): string | number | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }
  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function MetricLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[0.6875rem]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function VersionMetrics({ metrics }: { metrics: unknown }) {
  return (
    <div className="mt-2 space-y-1 rounded-lg bg-muted/30 px-2.5 py-2">
      <MetricLine
        label="Brier"
        value={
          metric(metrics, "brier") === null
            ? "—"
            : metric(metrics, "brier")!.toFixed(4)
        }
      />
      <MetricLine
        label="Log-loss"
        value={
          metric(metrics, "logLoss") === null
            ? "—"
            : metric(metrics, "logLoss")!.toFixed(4)
        }
      />
      <MetricLine
        label="N"
        value={
          metric(metrics, "sample") === null
            ? "—"
            : String(metric(metrics, "sample"))
        }
      />
      <MetricLine
        label="Brier mercado"
        value={
          metric(metrics, "marketBrier") === null
            ? "—"
            : metric(metrics, "marketBrier")!.toFixed(4)
        }
      />
      <MetricLine
        label="Peso óptimo forward"
        value={
          metric(metrics, "optimalWeight") === null
            ? "—"
            : metric(metrics, "optimalWeight")!.toFixed(2)
        }
      />
    </div>
  );
}

export async function ModelVersionsPanel({
  canPromote,
  adminConfigured,
}: {
  canPromote: boolean;
  adminConfigured: boolean;
}) {
  const { champion, challengers, retired } = await getModelVersionsOverview();

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <div>
        <h2 className="text-sm font-semibold">Modelo y versiones</h2>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          Campeón en producción y retador en sombra. La promoción es manual y
          solo se habilita si cumple la regla forward: N ≥ 300, mejora de Brier
          ≥ 0,5 %, bootstrap pareado que excluya 0 y log-loss no peor. Ningún
          cambio es automático.
        </p>
      </div>

      {!canPromote && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[0.6875rem] leading-snug text-amber-900 dark:text-amber-200">
          {adminConfigured
            ? "Promoción y rollback deshabilitados para tu cuenta. Solo el email configurado en ANALYSIS_ADMIN_EMAIL puede aprobar versiones."
            : "Promoción y rollback deshabilitados. Define ANALYSIS_ADMIN_EMAIL en el servidor y entra con ese email para poder aprobar versiones."}
        </p>
      )}

      <div className="rounded-lg border bg-background p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">
              {champion?.name ?? "Sin campeón registrado"}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">
              {champion?.promotedAt
                ? `Promovido ${formatDate(champion.promotedAt)}`
                : "Ejecuta analysis:tune para crear la línea base"}
            </p>
          </div>
          <Badge>Campeón</Badge>
        </div>
        {champion && <VersionMetrics metrics={champion.metrics} />}
        <p className="mt-2 text-[0.625rem] text-muted-foreground">
          Parámetros:{" "}
          {champion
            ? `half-life ${param(champion.params, "halfLifeDays") ?? "—"} · ridge ${param(champion.params, "ridge") ?? "—"} · local ${param(champion.params, "homeAdvantageMode") ?? "—"}`
            : "—"}
        </p>
      </div>

      {challengers.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
          No hay retador en observación. Ejecuta{" "}
          <code className="rounded bg-muted px-1">npm run analysis:tune</code>{" "}
          para generar uno.
        </p>
      ) : (
        challengers.map((challenger) => (
          <div key={challenger.id} className="rounded-lg border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{challenger.name}</p>
                <p className="text-[0.6875rem] text-muted-foreground">
                  En sombra desde {formatDate(challenger.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant="outline">Retador</Badge>
                {challenger.quick && (
                  <Badge variant="destructive">Quick · no promovible</Badge>
                )}
              </div>
            </div>

            <VersionMetrics metrics={challenger.metrics} />

            <div className="mt-2 rounded-lg bg-muted/30 px-2.5 py-2 text-[0.6875rem]">
              <p className="font-medium">Regla de promoción</p>
              <p className="mt-0.5 text-muted-foreground">
                N forward: {challenger.promotion?.sample ?? 0} · mejora Brier:{" "}
                {challenger.promotion?.relativeImprovement === null ||
                challenger.promotion?.relativeImprovement === undefined
                  ? "—"
                  : `${(challenger.promotion.relativeImprovement * 100).toFixed(2)}%`}{" "}
                · CI95:{" "}
                {challenger.promotion?.brierDifferenceCi
                  ? `[${challenger.promotion.brierDifferenceCi.lower.toFixed(4)}, ${challenger.promotion.brierDifferenceCi.upper.toFixed(4)}]`
                  : "—"}
              </p>
              <p className="mt-1 text-[0.625rem] text-muted-foreground">
                {challenger.promotion?.reasons.join(" ") ?? ""}
              </p>
            </div>

            {canPromote ? (
              <form action={promoteModelVersionAction} className="mt-2">
                <input type="hidden" name="versionId" value={challenger.id} />
                <Button
                  type="submit"
                  size="sm"
                  disabled={challenger.quick || !challenger.promotion?.eligible}
                  className="w-full sm:w-auto"
                >
                  {challenger.quick
                    ? "Quick: no promovible"
                    : challenger.promotion?.eligible
                      ? "Promover a campeón"
                      : "Aún no cumple la regla"}
                </Button>
              </form>
            ) : (
              <p className="mt-2 text-[0.625rem] text-muted-foreground">
                Promoción deshabilitada. Configura ANALYSIS_ADMIN_EMAIL.
              </p>
            )}
          </div>
        ))
      )}

      {retired.length > 0 && (
        <details className="rounded-lg border bg-muted/20">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
            Versiones retiradas ({retired.length})
          </summary>
          <ul className="space-y-2 border-t px-3 py-2">
            {retired.slice(0, 8).map((version) => (
              <li
                key={version.id}
                className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{version.name}</p>
                  <p className="text-[0.625rem] text-muted-foreground">
                    Retirada {version.retiredAt ? formatDate(version.retiredAt) : "—"} ·
                    Brier {metric(version.metrics, "brier")?.toFixed(4) ?? "—"}
                  </p>
                </div>
                {canPromote && (
                  <form action={rollbackModelVersionAction}>
                    <input type="hidden" name="versionId" value={version.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Volver a esta versión
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[0.625rem] text-muted-foreground">
        El peso modelo/mercado no se cambia al promover. Se reestima con la misma
        regla; sigue en 0 salvo mejora significativa sostenida.{" "}
        <Link href="/analysis" className="underline underline-offset-4">
          Ver precisión en /analysis
        </Link>
        .
      </p>
    </section>
  );
}
