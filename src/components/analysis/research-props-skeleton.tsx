import { Skeleton } from "@/components/ui/skeleton";

export function ResearchPropsSkeleton() {
  return (
    <section
      className="space-y-2"
      aria-busy="true"
      aria-label="Cargando mejores cuotas"
    >
      <div className="flex items-baseline justify-between gap-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3 w-16" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-20 rounded-full" />
        ))}
      </div>

      <Skeleton className="h-9 w-full rounded-lg" />

      <div className="space-y-1.5">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </section>
  );
}
