"use client";

import { useMemo, useState } from "react";
import {
  useFormContext,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  findCompetition,
  getCompetitionsForSport,
  groupCompetitionsByRegion,
} from "@/lib/catalogs/competitions";
import { OTHER_SPORT, SPORT_OPTIONS } from "@/lib/catalogs/sports";
import { cn } from "@/lib/utils";

type LegCatalogValues = {
  legs: { sport: string; competition: string }[];
};

type CatalogFieldProps = {
  index: number;
};

function paths(index: number) {
  return {
    sport: `legs.${index}.sport` as FieldPath<LegCatalogValues>,
    competition: `legs.${index}.competition` as FieldPath<LegCatalogValues>,
  };
}

export function SportField({ index }: CatalogFieldProps) {
  const { control, register, setValue } = useFormContext<LegCatalogValues>();
  const { sport: sportPath, competition: competitionPath } = paths(index);
  const sportValue =
    (useWatch({ control, name: sportPath }) as string | undefined) ?? "";
  const isOther = sportValue === OTHER_SPORT;
  const isKnown = (SPORT_OPTIONS as readonly string[]).includes(sportValue);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`leg-${index}-sport`} className="text-xs">
        Deporte
      </Label>
      <input type="hidden" {...register(sportPath)} />

      <Select
        value={sportValue}
        onValueChange={(value) => {
          setValue(sportPath, value, { shouldDirty: true });
          // Al cambiar de deporte, la competición deja de ser válida.
          setValue(competitionPath, "", { shouldDirty: true });
        }}
      >
        <SelectTrigger
          id={`leg-${index}-sport`}
          className="h-11 w-full"
          aria-label="Deporte"
        >
          <SelectValue placeholder="Elige deporte" />
        </SelectTrigger>
        <SelectContent>
          {SPORT_OPTIONS.map((sport) => (
            <SelectItem key={sport} value={sport}>
              {sport}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(isOther || (sportValue && !isKnown)) && (
        <Input
          aria-label="Especifica el deporte"
          placeholder="Escribe el deporte"
          maxLength={60}
          className="h-10"
          value={isOther ? "" : sportValue}
          onChange={(event) =>
            setValue(sportPath, event.target.value || OTHER_SPORT, {
              shouldDirty: true,
            })
          }
        />
      )}
    </div>
  );
}

export function CompetitionField({ index }: CatalogFieldProps) {
  const { control, register, setValue } = useFormContext<LegCatalogValues>();
  const { sport: sportPath, competition: competitionPath } = paths(index);
  const sportValue =
    (useWatch({ control, name: sportPath }) as string | undefined) ?? "";
  const competitionValue =
    (useWatch({ control, name: competitionPath }) as string | undefined) ?? "";

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);

  const competitions = useMemo(
    () => getCompetitionsForSport(sportValue),
    [sportValue],
  );

  const matched = findCompetition(sportValue, competitionValue);
  const selectedLabel = matched?.label ?? competitionValue;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return competitions;
    return competitions.filter(
      (competition) =>
        competition.label.toLowerCase().includes(normalized) ||
        competition.region.toLowerCase().includes(normalized),
    );
  }, [competitions, query]);

  const groups = useMemo(
    () => groupCompetitionsByRegion(filtered),
    [filtered],
  );

  const useManual =
    manual ||
    competitions.length === 0 ||
    !sportValue ||
    sportValue === OTHER_SPORT;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`leg-${index}-competition`} className="text-xs">
        Competición
      </Label>
      <input type="hidden" {...register(competitionPath)} />

      {useManual ? (
        <Input
          id={`leg-${index}-competition`}
          placeholder="Liga, torneo o evento"
          maxLength={80}
          className="h-11"
          value={competitionValue}
          onChange={(event) =>
            setValue(competitionPath, event.target.value, { shouldDirty: true })
          }
        />
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              id={`leg-${index}-competition`}
              aria-haspopup="listbox"
              aria-expanded={open}
              className={cn(
                "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                !selectedLabel && "text-muted-foreground",
              )}
            >
              <span className="truncate">
                {selectedLabel || "Buscar competición"}
              </span>
              <ChevronsUpDown
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[min(92vw,22rem)] p-0"
            align="start"
          >
            <div className="border-b p-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar liga o región"
                  aria-label="Buscar competición"
                  className="h-10 pl-8"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto overscroll-contain p-1">
              {groups.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Sin resultados.
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.region} className="mb-1">
                    <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.region}
                    </p>
                    {group.items.map((competition) => {
                      const active = competition.label === selectedLabel;
                      return (
                        <button
                          key={competition.value}
                          type="button"
                          onClick={() => {
                            setValue(competitionPath, competition.label, {
                              shouldDirty: true,
                            });
                            setOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                            active && "bg-muted",
                          )}
                        >
                          <Check
                            className={cn(
                              "size-4 shrink-0",
                              active ? "opacity-100" : "opacity-0",
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{competition.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full justify-start text-sm"
                onClick={() => {
                  setManual(true);
                  setOpen(false);
                  setValue(competitionPath, "", { shouldDirty: true });
                }}
              >
                Otra competición (escribir)
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {manual && competitions.length > 0 && (
        <button
          type="button"
          onClick={() => setManual(false)}
          className="text-[11px] font-medium text-primary underline-offset-4 hover:underline"
        >
          Elegir del catálogo
        </button>
      )}
    </div>
  );
}
