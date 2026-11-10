import { Skeleton } from "@/components/ui/skeleton";

export default function NewBetLoading() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Cargando formulario de apuesta"
    >
      <Skeleton className="h-8 w-24" />
      <div className="space-y-1">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
