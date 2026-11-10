import { Skeleton } from "@/components/ui/skeleton";

export default function EditBetLoading() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Cargando edición de apuesta"
    >
      <Skeleton className="h-8 w-24" />
      <div className="space-y-1">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
