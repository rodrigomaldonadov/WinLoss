import { Skeleton } from "@/components/ui/skeleton";

export default function ResearchLoading() {
  return (
    <div
      className="space-y-2"
      aria-busy="true"
      aria-label="Cargando investigación"
    >
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-10 w-full rounded-lg" />

      <div className="flex gap-1 overflow-hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-16 shrink-0 rounded-full" />
        ))}
      </div>

      <div className="flex gap-1 overflow-hidden">
        <Skeleton className="h-12 w-48 shrink-0 rounded-lg" />
        <Skeleton className="h-12 w-48 shrink-0 rounded-lg" />
      </div>

      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
