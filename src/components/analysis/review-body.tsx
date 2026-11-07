import { ReviewInsights } from "@/components/analysis/review-insights";
import { ReviewMarketTable } from "@/components/analysis/review-market-table";
import { ReviewPrivateBets } from "@/components/analysis/review-private-bets";
import type { ReviewResult } from "@/lib/analysis/review/types";

export type ReviewLoadResult =
  | { ok: true; review: ReviewResult | null }
  | { ok: false };

function Notice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-balance text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

/**
 * Cuerpo del detalle: espera la revisión (snapshot o reconstrucción) dentro de
 * un Suspense. Si la liga no tiene histórico, se explica en vez de fallar.
 */
export async function ReviewBody({
  result,
  timeZone,
}: {
  result: Promise<ReviewLoadResult>;
  timeZone?: string;
}) {
  const loaded = await result;

  if (!loaded.ok) {
    return (
      <Notice
        title="No pudimos calcular la revisión"
        description="La consulta falló. Vuelve a intentarlo en unos segundos."
      />
    );
  }

  const review = loaded.review;
  if (!review) {
    return (
      <Notice
        title="Sin análisis disponible para este partido"
        description="No hay una captura guardada y no se pudo reconstruir con los ratings de esa liga: puede ser una liga sin histórico, una copa internacional o un partido sin datos suficientes."
      />
    );
  }

  return (
    <div className="space-y-3">
      <ReviewMarketTable review={review} />
      <ReviewInsights review={review} timeZone={timeZone} />
      <ReviewPrivateBets legs={review.privateLegs} />
    </div>
  );
}
