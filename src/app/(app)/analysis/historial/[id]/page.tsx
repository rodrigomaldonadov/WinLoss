import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/auth";
import { HistoryDetailHeader } from "@/components/analysis/history-detail-header";
import {
  ReviewBody,
  type ReviewLoadResult,
} from "@/components/analysis/review-body";
import { ReviewFallback } from "@/components/analysis/review-fallback";
import { getMatchReview } from "@/lib/analysis/review/load";
import { getHistoryMatchHeader } from "@/lib/data/analysis-history";
import { getUserPreferences } from "@/lib/data/user";

export const metadata: Metadata = {
  title: "Revisión del partido",
};

type HistoryDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function HistoryDetailPage({
  params,
}: HistoryDetailPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const [header, preferences] = await Promise.all([
    getHistoryMatchHeader(id),
    getUserPreferences(session.user.id),
  ]);
  if (!header) notFound();

  // Arranca el cálculo antes de renderizar para que el Suspense haga streaming.
  const result: Promise<ReviewLoadResult> = getMatchReview({
    userId: session.user.id,
    matchId: id,
  }).then(
    (review) => ({ ok: true as const, review }),
    (error: unknown) => {
      console.error("[analysis] review detail:", error);
      return { ok: false as const };
    },
  );

  return (
    <div className="space-y-3">
      <HistoryDetailHeader
        header={header}
        timeZone={preferences.timezone}
      />
      <Suspense fallback={<ReviewFallback hasSnapshot={header.hasSnapshot} />}>
        <ReviewBody result={result} timeZone={preferences.timezone} />
      </Suspense>
    </div>
  );
}
