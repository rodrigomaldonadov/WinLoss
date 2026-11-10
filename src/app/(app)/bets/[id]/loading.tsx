import { Skeleton } from "@/components/ui/skeleton";

export default function BetDetailLoading() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Cargando apuesta"
    >
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>

      <div className="space-y-1">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-40" />
      </div>

      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
