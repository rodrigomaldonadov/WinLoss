import { Skeleton } from "@/components/ui/skeleton";

export default function PrecisionLoading() {
  return (
    <div
      className="space-y-3"
      aria-busy="true"
      aria-label="Cargando precisión"
    >
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-[26rem] w-full rounded-xl" />
    </div>
  );
}
