import { Skeleton } from "@/components/ui/skeleton";

export default function AnalysisDetailLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando análisis">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
