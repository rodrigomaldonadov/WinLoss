import { Skeleton } from "@/components/ui/skeleton";

export default function AnalysisHistoryLoading() {
  return (
    <div
      className="space-y-1.5"
      aria-busy="true"
      aria-label="Cargando historial"
    >
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-10 w-full" />
      <div className="flex gap-1">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <div className="space-y-1.5 pt-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[76px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
