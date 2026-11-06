import { Skeleton } from "@/components/ui/skeleton";

export default function DebtsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando deudas">
      <Skeleton className="h-9 w-36" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
      <Skeleton className="h-11 w-full rounded-full" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
    </div>
  );
}
