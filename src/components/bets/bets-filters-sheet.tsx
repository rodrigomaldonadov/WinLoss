"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type BetsFiltersSheetProps = {
  sports: string[];
};

export function BetsFiltersSheet({ sports }: BetsFiltersSheetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const estado = searchParams.get("estado") ?? "all";
  const desde = searchParams.get("desde") ?? "";
  const hasta = searchParams.get("hasta") ?? "";
  const sport = searchParams.get("sport") ?? "all";
  const tipo = searchParams.get("tipo") ?? "all";
  const q = searchParams.get("q") ?? "";
  const orden = searchParams.get("orden") ?? "recent";

  const [sportDraft, setSportDraft] = useState(sport);
  const [tipoDraft, setTipoDraft] = useState(tipo);
  const [desdeDraft, setDesdeDraft] = useState(desde);
  const [hastaDraft, setHastaDraft] = useState(hasta);
  const [qDraft, setQDraft] = useState(q);
  const [ordenDraft, setOrdenDraft] = useState(orden);

  const invalidRange = Boolean(
    desdeDraft && hastaDraft && desdeDraft > hastaDraft,
  );

  const activeCount = [
    sport !== "all",
    tipo !== "all",
    Boolean(desde),
    Boolean(hasta),
    Boolean(q),
    orden !== "recent",
  ].filter(Boolean).length;

  const applyFilters = () => {
    if (invalidRange) return;
    const params = new URLSearchParams();
    if (estado && estado !== "all") params.set("estado", estado);
    if (desdeDraft) params.set("desde", desdeDraft);
    if (hastaDraft) params.set("hasta", hastaDraft);
    if (sportDraft && sportDraft !== "all") params.set("sport", sportDraft);
    if (tipoDraft && tipoDraft !== "all") params.set("tipo", tipoDraft);
    const trimmed = qDraft.trim();
    if (trimmed) params.set("q", trimmed);
    if (ordenDraft && ordenDraft !== "recent") params.set("orden", ordenDraft);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setOpen(false);
  };

  const clearFilters = () => {
    setSportDraft("all");
    setTipoDraft("all");
    setDesdeDraft("");
    setHastaDraft("");
    setQDraft("");
    setOrdenDraft("recent");
    router.push(pathname, { scroll: false });
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2">
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtros
          {activeCount > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-6 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-2">
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>
            Busca, ordena y acota tu historial por tipo, fechas y deporte.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="bets-q">Buscar</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="bets-q"
                type="search"
                inputMode="search"
                autoComplete="off"
                placeholder="Evento, selección o #ID"
                value={qDraft}
                onChange={(event) => setQDraft(event.target.value)}
                maxLength={80}
                className="h-12 w-full pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bets-order">Ordenar por</Label>
            <Select value={ordenDraft} onValueChange={setOrdenDraft}>
              <SelectTrigger id="bets-order" className="h-12 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Más recientes</SelectItem>
                <SelectItem value="oldest">Más antiguas</SelectItem>
                <SelectItem value="profit">Mayor beneficio</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bets-type">Tipo</Label>
            <Select value={tipoDraft} onValueChange={setTipoDraft}>
              <SelectTrigger id="bets-type" className="h-12 w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="single">Simple</SelectItem>
                <SelectItem value="multiple">Múltiple</SelectItem>
                <SelectItem value="builder">Builder</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bets-sport">Deporte</Label>
            <Select value={sportDraft} onValueChange={setSportDraft}>
              <SelectTrigger id="bets-sport" className="h-12 w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {sports.map((sportOption) => (
                  <SelectItem key={sportOption} value={sportOption}>
                    {sportOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bets-desde">Desde</Label>
              <Input
                id="bets-desde"
                type="date"
                value={desdeDraft}
                onChange={(event) => setDesdeDraft(event.target.value)}
                aria-invalid={invalidRange}
                aria-describedby={invalidRange ? "bets-date-error" : undefined}
                className="h-12 w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bets-hasta">Hasta</Label>
              <Input
                id="bets-hasta"
                type="date"
                value={hastaDraft}
                onChange={(event) => setHastaDraft(event.target.value)}
                aria-invalid={invalidRange}
                aria-describedby={invalidRange ? "bets-date-error" : undefined}
                className="h-12 w-full"
              />
            </div>
          </div>

          {invalidRange && (
            <p
              id="bets-date-error"
              role="alert"
              className="text-xs text-destructive"
            >
              La fecha “Desde” no puede ser posterior a “Hasta”.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={clearFilters}
            >
              Limpiar
            </Button>
            <Button
              type="button"
              className="h-12"
              onClick={applyFilters}
              disabled={invalidRange}
            >
              Aplicar filtros
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
