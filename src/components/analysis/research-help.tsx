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

export function ResearchHelpButton() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Qué significa cada dato"
        >
          <HelpCircle className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Qué significa cada dato</SheetTitle>
          <SheetDescription>
            Guía rápida para leer la investigación sin jerga.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-8 text-sm leading-snug">
          <div>
            <p className="font-semibold">“En resumen”</p>
            <p className="text-muted-foreground">
              Lo más probable según la referencia, cuánto se separa del resto de
              casas, la mejor cuota disponible y si hay arbitraje.
            </p>
          </div>

          <div>
            <p className="font-semibold">Probabilidad</p>
            <p className="text-muted-foreground">
              Porcentaje sin margen que las casas asignan a un resultado. Se
              calcula quitando el margen de la cuota. No garantiza el resultado.
            </p>
          </div>

          <div>
            <p className="font-semibold">Referencia</p>
            <p className="text-muted-foreground">
              Casa de margen bajo que se usa como referencia: Novig y, si no
              cotiza, ProphetX. Pinnacle no está en ParlayAPI.
            </p>
          </div>

          <div>
            <p className="font-semibold">Consenso</p>
            <p className="text-muted-foreground">
              Mediana de las demás casas, también sin margen. Sirve para ver si
              la referencia está por encima o por debajo del resto.
            </p>
          </div>

          <div>
            <p className="font-semibold">Puntos</p>
            <p className="text-muted-foreground">
              Diferencia de probabilidad: 1 punto = 1 %. “+1.7 puntos” significa
              que la referencia da 1.7 % más de probabilidad que el consenso.
            </p>
          </div>

          <div>
            <p className="font-semibold">Mejor cuota</p>
            <p className="text-muted-foreground">
              La cuota decimal más alta entre las casas que cotizaron ese
              resultado. Se indica siempre de qué casa sale.
            </p>
          </div>

          <div>
            <p className="font-semibold">Arbitraje</p>
            <p className="text-muted-foreground">
              Combinar la mejor cuota de cada lado para que la suma de
              probabilidades implícitas sea menor que 1
              (1/cuota A + 1/cuota B &lt; 1). Es poco frecuente y no está
              garantizado: pueden aparecer límites o falta de liquidez.
            </p>
          </div>

          <div>
            <p className="font-semibold">Más / Menos</p>
            <p className="text-muted-foreground">
              Es el Over/Under de una línea. “Más de 24.5 puntos” gana si el
              jugador anota 25 o más; “Menos” gana con 24 o menos.
            </p>
          </div>

          <div>
            <p className="font-semibold">Margen (vig)</p>
            <p className="text-muted-foreground">
              Lo que se queda la casa por encima de las probabilidades reales.
              Cuanto menor, mejor para ti.
            </p>
          </div>

          <div>
            <p className="font-semibold">Exchange</p>
            <p className="text-muted-foreground">
              Novig y ProphetX son exchanges: las cuotas las ponen otros
              usuarios. Pueden tener poca liquidez; se muestran tal cual, sin
              suavizarlas.
            </p>
          </div>

          <p className="text-muted-foreground">
            Datos de ParlayAPI. Si una casa no cotizó un mercado, no aparece: no
            se inventan cuotas.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

