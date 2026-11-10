import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-xs ring-1 ring-border">
        <Compass className="size-6" strokeWidth={1.8} aria-hidden />
      </div>
      <p className="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Error 404
      </p>
      <h1 className="mt-1 text-lg font-semibold">No encontramos esta página</h1>
      <p className="mt-1 max-w-xs text-sm text-balance text-muted-foreground">
        Puede que el enlace esté mal escrito o que el contenido ya no exista.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button asChild className="h-11">
          <Link href="/">Ir al inicio</Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/bets">Ver apuestas</Link>
        </Button>
      </div>
    </div>
  );
}
