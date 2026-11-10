import { Skeleton } from "@/components/ui/skeleton";

export default function BankrollLoading() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Cargando bankroll"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-11 w-11 rounded-lg" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>

      <div className="space-y-1">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-56" />
      </div>

      <div className="flex gap-1 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-20 shrink-0 rounded-full" />
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
