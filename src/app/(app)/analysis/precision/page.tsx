import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AnalysisTabs } from "@/components/analysis/analysis-tabs";
import { ModelAccuracyPanel } from "@/components/analysis/model-accuracy-panel";
import { PageHeader } from "@/components/page-header";
import { getForwardAccuracy } from "@/lib/data/analysis-forward";
import { getModelAccuracy } from "@/lib/data/analysis";

export const metadata: Metadata = {
  title: "Precisión del modelo",
};

export default async function AnalysisPrecisionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [accuracy, forward] = await Promise.all([
    Promise.resolve(getModelAccuracy()),
    getForwardAccuracy(),
  ]);

  return (
    <div className="space-y-3">
      <PageHeader
        className="pb-0"
        title="Precisión"
        description="Backtest histórico y forward test, con su muestra."
      />
      <AnalysisTabs active="precision" />
      <ModelAccuracyPanel accuracy={accuracy} forward={forward} />
    </div>
  );
}
