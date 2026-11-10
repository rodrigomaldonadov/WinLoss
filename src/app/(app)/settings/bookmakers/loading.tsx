import { Skeleton } from "@/components/ui/skeleton";

export default function BookmakersLoading() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Cargando casas de apuestas"
    >
      <Skeleton className="h-8 w-24" />
      <div className="space-y-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
