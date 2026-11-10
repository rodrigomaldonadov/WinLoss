import { Skeleton } from "@/components/ui/skeleton";

export default function HistoryDetailLoading() {
  return (
    <div
      className="space-y-3"
      aria-busy="true"
      aria-label="Cargando partido"
    >
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-5 w-40 rounded-full" />
      </div>

      <div className="space-y-1">
        <Skeleton className="h-3 w-52" />
        <Skeleton className="h-6 w-64 max-w-full" />
        <Skeleton className="h-8 w-24" />
      </div>

      <Skeleton className="h-16 w-full rounded-lg" />

      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
