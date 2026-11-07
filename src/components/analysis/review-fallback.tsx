import { Skeleton } from "@/components/ui/skeleton";

export function ReviewFallback({ hasSnapshot }: { hasSnapshot: boolean }) {
  return (
    <div
      className="space-y-2"
      aria-busy="true"
      aria-live="polite"
      aria-label="Cargando la revisión del partido"
    >
      <p className="text-[11px] text-muted-foreground">
        {hasSnapshot
          ? "Cargando la captura guardada…"
          : "Reconstruyendo con los ratings de esa semana…"}
      </p>
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}
