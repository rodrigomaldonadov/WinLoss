"use client";

import { useState } from "react";
import {
  ClipboardPaste,
  Loader2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  parseBetText,
  type ParsedBet,
} from "@/lib/bet-text-parser";
import { formatOdds } from "@/lib/format";

type PasteBetSheetProps = {
  onParsed: (bet: ParsedBet) => void;
  disabled?: boolean;
};

const PLACEHOLDER = `Pega aquí el texto copiado del boleto…

Ejemplo:
Múltiple x2
S/ 10.00
Cuota 3.40

Real Madrid vs Barcelona
Real Madrid
2.00
Resultado del partido (1X2)
14/10 • 14:00`;

function formatAmount(value: number, currency: string | null): string {
  return `${currency ?? "PEN"} ${value.toFixed(2)}`;
}

/**
 * Importa un boleto copiado como texto (formato de Apuesta Total y similares).
 * Muestra una vista previa antes de rellenar el formulario.
 */
export function PasteBetSheet({ onParsed, disabled }: PasteBetSheetProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedBet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const analyze = (value = text) => {
    const result = parseBetText(value);
    if (result.legs.length === 0) {
      setParsed(null);
      setError(
        "No encontramos partidos en el texto. Copia también las líneas con “Equipo A vs Equipo B”.",
      );
      return;
    }
    setParsed(result);
    setError(null);
  };

  const pasteFromClipboard = async () => {
    setReading(true);
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Este navegador no permite leer el portapapeles.");
      }
      const clipboard = await navigator.clipboard.readText();
      if (!clipboard.trim()) {
        toast.error("El portapapeles está vacío.");
        return;
      }
      setText(clipboard);
      analyze(clipboard);
    } catch {
      toast.error("No pudimos leer el portapapeles. Pega el texto a mano.");
    } finally {
      setReading(false);
    }
  };

  const apply = () => {
    if (!parsed) return;
    onParsed(parsed);
    setOpen(false);
    setText("");
    setParsed(null);
    setError(null);
  };

  const reset = () => {
    setText("");
    setParsed(null);
    setError(null);
  };

  const legs = parsed?.legs ?? [];
  const totalSelections = legs.reduce(
    (sum, leg) => sum + leg.selections.length,
    0,
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
        }
      }}
    >
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2 border-dashed"
          disabled={disabled}
        >
          <ClipboardPaste className="size-4" aria-hidden />
          Pegar texto del boleto
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Nuevo
          </span>
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col gap-0 rounded-t-2xl pb-0 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-3 pr-10">
          <SheetTitle>Pegar boleto</SheetTitle>
          <SheetDescription>
            Copia el texto desde tu casa de apuestas. Previsualiza y corrige
            antes de rellenar el formulario.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (parsed) setParsed(null);
              if (error) setError(null);
            }}
            placeholder={PLACEHOLDER}
            rows={7}
            aria-label="Texto del boleto"
            className="h-40 min-h-0 resize-none field-sizing-fixed overflow-y-auto font-mono text-[11px] leading-relaxed"
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2"
              onClick={() => void pasteFromClipboard()}
              disabled={reading || disabled}
            >
              {reading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ClipboardPaste className="size-4" aria-hidden />
              )}
              Pegar
            </Button>
            <Button
              type="button"
              className="h-11 gap-2"
              onClick={() => analyze()}
              disabled={!text.trim() || disabled}
            >
              <Sparkles className="size-4" aria-hidden />
              Analizar
            </Button>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}

          {parsed && (
            <div className="space-y-3" aria-live="polite">
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {parsed.betType === "COMBINED"
                      ? `Múltiple · ${legs.length}`
                      : "Simple"}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {legs.length} partido{legs.length === 1 ? "" : "s"}
                  </Badge>
                  {totalSelections > legs.length && (
                    <Badge variant="secondary" className="text-[10px]">
                      {totalSelections} selecciones
                    </Badge>
                  )}
                  {parsed.oddsBoostPct !== null && (
                    <Badge variant="secondary" className="text-[10px]">
                      Boost +
                      {parsed.oddsBoostPct % 1 === 0
                        ? parsed.oddsBoostPct
                        : parsed.oddsBoostPct.toFixed(2)}
                      %
                    </Badge>
                  )}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Stake
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {parsed.stake !== null
                        ? formatAmount(parsed.stake, parsed.currency)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Cuota total
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {parsed.totalOdds !== null
                        ? formatOdds(parsed.totalOdds)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <ul className="space-y-1.5">
                {legs.map((leg, index) => (
                  <li
                    key={`${leg.eventName}-${index}`}
                    className="rounded-lg border bg-card px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-xs font-medium">
                        {index + 1}. {leg.eventName}
                      </p>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">
                        {leg.odds !== null ? formatOdds(leg.odds) : "—"}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {leg.selections.length > 0
                        ? leg.selections
                            .map(
                              (selection) =>
                                `${selection.market}: ${selection.selection}`,
                            )
                            .join(" · ")
                        : "Sin selección detectada"}
                    </p>
                    {leg.isBuilder && (
                      <p className="mt-0.5 text-[10px] font-medium text-primary">
                        {leg.selections.length} selecciones combinadas
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {parsed.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <p className="flex items-center gap-1.5 font-medium">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                    Revisa antes de guardar
                  </p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {parsed.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-popover/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="flex gap-2">
            {parsed && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12 shrink-0"
                aria-label="Limpiar texto"
                onClick={reset}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
            <Button
              type="button"
              className="h-12 flex-1 gap-2"
              onClick={apply}
              disabled={!parsed || disabled}
            >
              Rellenar formulario
              {parsed ? ` (${legs.length})` : ""}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
