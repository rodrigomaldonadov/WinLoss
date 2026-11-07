import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { History } from "lucide-react";

import { auth } from "@/auth";
import { AnalysisTabs } from "@/components/analysis/analysis-tabs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Historial de análisis",
};

export default async function AnalysisHistoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-3">
      <PageHeader
        className="pb-0"
        title="Historial"
        description="Partidos jugados y qué decía el análisis antes del inicio."
      />
      <AnalysisTabs active="history" />
      <EmptyState
        icon={History}
        title="Buscador de partidos jugados"
        description="Aquí podrás buscar por equipo, competición y fecha para ver la predicción guardada o la reconstrucción retrospectiva."
      />
    </div>
  );
}
