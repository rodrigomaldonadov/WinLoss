import { Skeleton } from "@/components/ui/skeleton";

export default function AnalysisLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando consenso">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-11 w-48 rounded-full" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
