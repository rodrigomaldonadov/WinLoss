"use client";

import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AnalysisHelpButton() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Cómo leer esta pantalla"
        >
          <HelpCircle className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Cómo leer esta pantalla</SheetTitle>
          <SheetDescription>
            Qué significa cada fuente y qué puedes esperar de las cifras.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-8 text-sm leading-snug">
          <p>
            <strong className="text-foreground">Mercado:</strong> promedio de
            cierre sin margen. Es la fuente principal cuando las cuotas están
            frescas.
          </p>
          <p>
            <strong className="text-foreground">Modelo:</strong> estimación
            estadística de la liga. Se muestra como comparación; en pruebas el
            mercado tuvo mejor Brier.
          </p>
          <p>
            <strong className="text-foreground">Comunidad:</strong> agregado
            anónimo de picks, solo con 5 usuarios distintos o más.
          </p>
          <p>
            <strong className="text-foreground">Confianza:</strong> alta con
            cuotas de mercado frescas; baja cuando solo hay modelo o la muestra
            es corta; sin datos cuando no hay base suficiente.
          </p>
          <p>
            Tocar un mercado precarga esa selección en{" "}
            <strong className="text-foreground">Nueva apuesta</strong>, sin
            cuota. Tocar la tarjeta abre el detalle del partido.
          </p>
          <p>
            La cuota justa es 1 / probabilidad. El comparador del detalle no es
            una recomendación ni predice el retorno.
          </p>
          <p className="text-muted-foreground">
            Las probabilidades son estimaciones; no garantizan el resultado.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

