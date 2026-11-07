import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AnalysisDetailView } from "@/components/analysis/analysis-detail-view";
import { getAnalysisDetail } from "@/lib/data/analysis";
import { getUserPreferences } from "@/lib/data/user";

export const metadata: Metadata = {
  title: "Detalle del análisis",
};

type AnalysisDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AnalysisDetailPage({
  params,
}: AnalysisDetailPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const [detail, preferences] = await Promise.all([
    getAnalysisDetail(session.user.id, id),
    getUserPreferences(session.user.id),
  ]);

  if (!detail) notFound();

  return (
    <AnalysisDetailView detail={detail} timeZone={preferences.timezone} />
  );
}
