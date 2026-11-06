import { Skeleton } from "@/components/ui/skeleton";

export default function BetsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando apuestas">
      <Skeleton className="h-9 w-40" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-44 w-full rounded-xl" />
      ))}
    </div>
  );
}
