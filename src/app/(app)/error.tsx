"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-background text-destructive shadow-xs ring-1 ring-border">
        <TriangleAlert className="size-6" strokeWidth={1.8} aria-hidden />
      </div>
      <h1 className="mt-4 text-base font-semibold">Algo salió mal</h1>
      <p className="mt-1 max-w-xs text-sm text-balance text-muted-foreground">
        No pudimos cargar esta sección. Vuelve a intentarlo; si sigue fallando,
        revisa la conexión con la base de datos.
      </p>
      {error.digest && (
        <p className="mt-2 text-[10px] text-muted-foreground tabular-nums">
          Código: {error.digest}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={reset} className="h-11 gap-1.5">
          <RefreshCw className="size-4" aria-hidden />
          Reintentar
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/">Ir al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
