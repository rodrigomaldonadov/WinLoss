import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div
      className="space-y-5"
      aria-busy="true"
      aria-label="Cargando ajustes"
    >
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
