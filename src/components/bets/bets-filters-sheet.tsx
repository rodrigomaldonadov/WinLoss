"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

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

  const [sportDraft, setSportDraft] = useState(sport);
  const [desdeDraft, setDesdeDraft] = useState(desde);
  const [hastaDraft, setHastaDraft] = useState(hasta);

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (estado && estado !== "all") params.set("estado", estado);
    if (desdeDraft) params.set("desde", desdeDraft);
    if (hastaDraft) params.set("hasta", hastaDraft);
    if (sportDraft && sportDraft !== "all") params.set("sport", sportDraft);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setOpen(false);
  };

  const clearFilters = () => {
    setSportDraft("all");
    setDesdeDraft("");
    setHastaDraft("");
    router.replace(pathname, { scroll: false });
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2">
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtros
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-6 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-2">
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>
            Rango de fechas y deporte de tu historial.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
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
                className="h-12 w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={clearFilters}
            >
              Limpiar
            </Button>
            <Button type="button" className="h-12" onClick={applyFilters}>
              Aplicar filtros
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
