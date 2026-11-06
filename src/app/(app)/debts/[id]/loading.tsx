import { Skeleton } from "@/components/ui/skeleton";

export default function DebtDetailLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando deuda">
      <Skeleton className="h-9 w-24" />
      <Skeleton className="h-10 w-52" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
