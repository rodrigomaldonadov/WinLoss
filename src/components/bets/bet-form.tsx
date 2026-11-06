"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { LegMarketKey } from "@prisma/client";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type FieldArrayPath,
  type FieldPath,
} from "react-hook-form";
import { CircleAlert, ChevronDown, ListPlus, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  NewBetOCRButton,
  type OCRTicketData,
} from "@/components/bets/ocr/new-bet-ocr-button";
import {
  CompetitionField,
  SportField,
} from "@/components/bets/leg-catalog-fields";
import { DateTimeCompact } from "@/components/bets/date-time-field";
import { EventSearchSheet } from "@/components/bets/event-search-sheet";
import { LinePicker } from "@/components/bets/line-picker";
import type { ApiEvent } from "@/lib/sports-api/types";
import {
  CARD_LINE_PRESETS,
  CORNER_LINE_PRESETS,
  GOAL_LINE_PRESETS,
} from "@/lib/line-utils";
import { createBet, updateBet, type BetFormState } from "@/lib/actions/bet";
import { MARKETS, SPORTS } from "@/lib/constants";
import { totalOdds } from "@/lib/bet-math";
import { toZonedDateTimeInput } from "@/lib/date";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { BankrollSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const initialState: BetFormState = {};

const STAKE_CHIPS = [0.02, 0.05, 0.1] as const;
const QUICK_STAKES = [10, 20, 50, 100] as const;
const DRAFT_KEY = "winloss:bet-draft:v1";
const LAST_BET_KEY = "winloss:last-bet:v1";
const LAST_STAKE_KEY = "winloss:last-stake:v1";
const MAX_LEGS = 20;

export type BetFormLegDefaults = {
  sport?: string;
  competition?: string | null;
  eventName?: string;
  eventDate?: string | null;
  isBuilder?: boolean;
  odds?: number;
  externalProvider?: string | null;
  externalEventId?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  selections?: {
    market: string;
    selection: string;
    marketKey?: LegMarketKey;
    line?: number | null;
    pick?: string | null;
    subject?: string | null;
  }[];
};

type BetFormProps = {
  bankrolls: BankrollSummary[];
  bookmakers: { id: string; name: string }[];
  defaultPlacedAt: string;
  mode?: "create" | "edit";
  timeZone?: string;
  /** Usar última casa/bankroll/stake y borrador (false al duplicar). */
  useLastUsed?: boolean;
  defaults?: BetFormDefaults;
};

export type BetFormDefaults = {
  id?: string;
  bankrollId?: string;
  bookmakerId?: string | null;
  externalId?: string | null;
  betType?: "SINGLE" | "COMBINED";
  sport?: string;
  competition?: string | null;
  eventName?: string;
  market?: string;
  selection?: string;
  odds?: number;
  stake?: number;
  isFreeBet?: boolean;
  placedAt?: string;
  notes?: string | null;
  legs?: BetFormLegDefaults[];
};

type BetMode = "SINGLE" | "COMBINED";

type SelectionValues = {
  market: string;
  selection: string;
  marketKey: LegMarketKey;
  line: string;
  pick: string;
  subject: string;
};

type LegValues = {
  sport: string;
  competition: string;
  eventName: string;
  eventDate: string;
  isBuilder: boolean;
  odds: string;
  externalProvider: string;
  externalEventId: string;
  homeTeam: string;
  awayTeam: string;
  selections: SelectionValues[];
};

type BetFormValues = {
  legs: LegValues[];
};

type BetDraft = {
  legs: LegValues[];
  betMode: BetMode;
  bankrollId: string;
  bookmakerId: string;
  stake: string;
  isFreeBet: boolean;
  externalId: string;
  placedAt: string;
  notes: string;
  savedAt: number;
};

function isEmptyLeg(leg: LegValues | undefined): boolean {
  if (!leg) return true;
  return (
    !leg.eventName.trim() &&
    !leg.odds.trim() &&
    leg.selections.every(
      (selection) =>
        !selection.market.trim() && !selection.selection.trim(),
    )
  );
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptySelection(): SelectionValues {
  return {
    market: "",
    selection: "",
    marketKey: "CUSTOM",
    line: "",
    pick: "",
    subject: "",
  };
}

function emptyLeg(): LegValues {
  return {
    sport: "",
    competition: "",
    eventName: "",
    eventDate: "",
    isBuilder: false,
    odds: "",
    externalProvider: "",
    externalEventId: "",
    homeTeam: "",
    awayTeam: "",
    selections: [emptySelection()],
  };
}

function toLegValues(leg: BetFormLegDefaults): LegValues {
  const selections =
    leg.selections && leg.selections.length > 0
      ? leg.selections.map((selection) => ({
          market: selection.market,
          selection: selection.selection,
          marketKey: selection.marketKey ?? "CUSTOM",
          line:
            selection.line === null || selection.line === undefined
              ? ""
              : String(selection.line),
          pick: selection.pick ?? "",
          subject: selection.subject ?? "",
        }))
      : [emptySelection()];

  return {
    sport: leg.sport ?? "",
    competition: leg.competition ?? "",
    eventName: leg.eventName ?? "",
    eventDate: leg.eventDate ?? "",
    isBuilder: leg.isBuilder ?? false,
    odds: leg.odds !== undefined ? String(leg.odds) : "",
    externalProvider: leg.externalProvider ?? "",
    externalEventId: leg.externalEventId ?? "",
    homeTeam: leg.homeTeam ?? "",
    awayTeam: leg.awayTeam ?? "",
    selections,
  };
}

function buildInitialLegs(defaults?: BetFormDefaults): LegValues[] {
  if (defaults?.legs && defaults.legs.length > 0) {
    return defaults.legs.map(toLegValues);
  }

  if (
    defaults?.sport ||
    defaults?.eventName ||
    defaults?.odds !== undefined ||
    defaults?.market ||
    defaults?.selection
  ) {
    return [
      {
        sport: defaults?.sport ?? "",
        competition: defaults?.competition ?? "",
        eventName: defaults?.eventName ?? "",
        eventDate: "",
        isBuilder: false,
        odds: defaults?.odds !== undefined ? String(defaults.odds) : "",
        externalProvider: "",
        externalEventId: "",
        homeTeam: "",
        awayTeam: "",
        selections: [
          {
            market: defaults?.market ?? "",
            selection: defaults?.selection ?? "",
            marketKey: "CUSTOM",
            line: "",
            pick: "",
            subject: "",
          },
        ],
      },
    ];
  }

  return [emptyLeg()];
}

function calculateTotalOdds(legs: LegValues[]): number {
  return totalOdds(legs.map((leg) => ({ odds: leg.odds || "0" }))).toNumber();
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

type SelectionsFieldsProps = {
  legIndex: number;
  isBuilder: boolean;
  fields: Array<SelectionValues & { id: string }>;
  onAppend: () => void;
  onRemove: (index: number) => void;
};

const MARKET_OPTIONS: { value: LegMarketKey; label: string }[] = [
  { value: "MATCH_RESULT", label: "Resultado final (1X2)" },
  { value: "DOUBLE_CHANCE", label: "Doble oportunidad" },
  { value: "DRAW_NO_BET", label: "Empate no válido (DNB)" },
  { value: "TOTAL_GOALS", label: "Total de goles" },
  { value: "BTTS", label: "Ambos equipos marcan" },
  { value: "ASIAN_HANDICAP", label: "Hándicap asiático" },
  { value: "TEAM_TOTAL_GOALS", label: "Goles por equipo" },
  { value: "ODD_EVEN", label: "Total par o impar" },
  { value: "WIN_TO_NIL", label: "Gana sin recibir gol" },
  { value: "EXACT_TOTAL_GOALS", label: "Total exacto de goles" },
  { value: "TOTAL_CORNERS", label: "Córneres (más/menos)" },
  { value: "TOTAL_CARDS", label: "Tarjetas (más/menos)" },
  { value: "GENERIC_LINE", label: "Otro mercado con línea" },
  { value: "CUSTOM", label: "Otro mercado (manual)" },
];

const MARKET_LABELS: Record<LegMarketKey, string> = Object.fromEntries(
  MARKET_OPTIONS.map((option) => [option.value, option.label]),
) as Record<LegMarketKey, string>;

const MARKET_PICKS: Record<
  Exclude<LegMarketKey, "CUSTOM">,
  { value: string; label: string }[]
> = {
  MATCH_RESULT: [
    { value: "HOME", label: "Local" },
    { value: "DRAW", label: "Empate" },
    { value: "AWAY", label: "Visitante" },
  ],
  DOUBLE_CHANCE: [
    { value: "HOME_DRAW", label: "1X" },
    { value: "HOME_AWAY", label: "12" },
    { value: "DRAW_AWAY", label: "X2" },
  ],
  DRAW_NO_BET: [
    { value: "HOME", label: "Local" },
    { value: "AWAY", label: "Visitante" },
  ],
  TOTAL_GOALS: [
    { value: "OVER", label: "Más de" },
    { value: "UNDER", label: "Menos de" },
  ],
  BTTS: [
    { value: "YES", label: "Sí" },
    { value: "NO", label: "No" },
  ],
  ASIAN_HANDICAP: [
    { value: "HOME", label: "Local" },
    { value: "AWAY", label: "Visitante" },
  ],
  TEAM_TOTAL_GOALS: [
    { value: "HOME_OVER", label: "Local +" },
    { value: "HOME_UNDER", label: "Local −" },
    { value: "AWAY_OVER", label: "Visitante +" },
    { value: "AWAY_UNDER", label: "Visitante −" },
  ],
  ODD_EVEN: [
    { value: "ODD", label: "Impar" },
    { value: "EVEN", label: "Par" },
  ],
  WIN_TO_NIL: [
    { value: "HOME", label: "Local" },
    { value: "AWAY", label: "Visitante" },
  ],
  EXACT_TOTAL_GOALS: [],
  TOTAL_CORNERS: [
    { value: "OVER", label: "Más de" },
    { value: "UNDER", label: "Menos de" },
  ],
  TOTAL_CARDS: [
    { value: "OVER", label: "Más de" },
    { value: "UNDER", label: "Menos de" },
  ],
  GENERIC_LINE: [
    { value: "OVER", label: "Más de" },
    { value: "UNDER", label: "Menos de" },
  ],
};

const MARKET_CHIP_ORDER: { value: LegMarketKey; label: string }[] = [
  { value: "MATCH_RESULT", label: "1X2" },
  { value: "DOUBLE_CHANCE", label: "Doble oportunidad" },
  { value: "TOTAL_GOALS", label: "Goles del partido" },
  { value: "TEAM_TOTAL_GOALS", label: "Goles de un equipo" },
  { value: "BTTS", label: "Ambos anotan" },
  { value: "TOTAL_CORNERS", label: "Córneres" },
  { value: "TOTAL_CARDS", label: "Tarjetas" },
  { value: "DRAW_NO_BET", label: "DNB" },
  { value: "ASIAN_HANDICAP", label: "Hándicap" },
  { value: "ODD_EVEN", label: "Par/Impar" },
  { value: "WIN_TO_NIL", label: "Gana sin recibir" },
  { value: "EXACT_TOTAL_GOALS", label: "Total exacto" },
  { value: "GENERIC_LINE", label: "Otros con línea" },
  { value: "CUSTOM", label: "Otros" },
];

const MARKET_USAGE_KEY = "winloss:market-usage:v1";

function readMarketUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(MARKET_USAGE_KEY) ?? "{}") as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
}

function sortMarketChips(): { value: LegMarketKey; label: string }[] {
  const usage = readMarketUsage();
  return [...MARKET_CHIP_ORDER].sort(
    (a, b) => (usage[b.value] ?? 0) - (usage[a.value] ?? 0),
  );
}

const PICKER_LINE_MARKETS: LegMarketKey[] = [
  "TOTAL_GOALS",
  "TEAM_TOTAL_GOALS",
  "TOTAL_CORNERS",
  "TOTAL_CARDS",
  "GENERIC_LINE",
];

const LINE_MARKETS: LegMarketKey[] = [
  ...PICKER_LINE_MARKETS,
  "ASIAN_HANDICAP",
  "EXACT_TOTAL_GOALS",
];

function linePresets(marketKey: LegMarketKey): readonly number[] {
  if (marketKey === "TOTAL_CORNERS") return CORNER_LINE_PRESETS;
  if (marketKey === "TOTAL_CARDS") return CARD_LINE_PRESETS;
  return GOAL_LINE_PRESETS;
}

function pickLabel(marketKey: LegMarketKey, pick: string): string {
  if (marketKey === "CUSTOM") return "";
  return (
    MARKET_PICKS[marketKey as Exclude<LegMarketKey, "CUSTOM">]?.find(
      (option) => option.value === pick,
    )?.label ?? pick
  );
}

function buildSelectionLabel(
  marketKey: LegMarketKey,
  pick: string,
  line: string,
  subject?: string | null,
): string {
  if (!pick) return "";
  const label = pickLabel(marketKey, pick);

  switch (marketKey) {
    case "TOTAL_GOALS":
      return line ? `${label} ${line}` : `${label} …`;
    case "TEAM_TOTAL_GOALS": {
      const [prefixedTeam, prefixedSide] = pick.split("_");
      const team = subject ?? prefixedTeam;
      const side = subject ? pick : prefixedSide;
      const teamLabel = team === "HOME" ? "Local" : "Visitante";
      const sideLabel = side === "OVER" ? "más de" : "menos de";
      return line ? `${teamLabel} ${sideLabel} ${line}` : `${teamLabel} …`;
    }
    case "TOTAL_CORNERS":
      return line ? `${label} ${line} córneres` : `${label} …`;
    case "TOTAL_CARDS":
      return line ? `${label} ${line} tarjetas` : `${label} …`;
    case "GENERIC_LINE":
      return line ? `${label} ${line}` : `${label} …`;
    case "ASIAN_HANDICAP":
      return line ? `${label} (${line})` : `${label} …`;
    case "WIN_TO_NIL":
      return pick === "HOME"
        ? "Local gana sin recibir"
        : "Visitante gana sin recibir";
    case "EXACT_TOTAL_GOALS":
      return line ? `${line} goles exactos` : "Total exacto …";
    default:
      return label;
  }
}

function lineConfig(marketKey: LegMarketKey): {
  label: string;
  hint: string;
  placeholder: string;
} {
  switch (marketKey) {
    case "ASIAN_HANDICAP":
      return {
        label: "Hándicap del local",
        hint: "Negativo si el local da ventaja (-0.5, -1, -0.25)",
        placeholder: "-0.5",
      };
    case "TEAM_TOTAL_GOALS":
      return {
        label: "Línea del equipo",
        hint: "Goles del equipo al 90'",
        placeholder: "1.5",
      };
    case "EXACT_TOTAL_GOALS":
      return {
        label: "Total exacto",
        hint: "Goles exactos al 90'",
        placeholder: "3",
      };
    default:
      return {
        label: "Línea",
        hint: "Goles totales (90 min)",
        placeholder: "2.5",
      };
  }
}

type SelectionEditorProps = {
  legIndex: number;
  selectionIndex: number;
  canRemove: boolean;
  disableRemove: boolean;
  onRemove: () => void;
};

function SelectionEditor({
  legIndex,
  selectionIndex,
  canRemove,
  disableRemove,
  onRemove,
}: SelectionEditorProps) {
  const { register, setValue, control } = useFormContext<BetFormValues>();
  const base = `legs.${legIndex}.selections.${selectionIndex}`;
  const path = (field: string) => `${base}.${field}` as FieldPath<BetFormValues>;

  const marketKey =
    (useWatch({ control, name: path("marketKey") }) as LegMarketKey) ??
    "CUSTOM";
  const pick = (useWatch({ control, name: path("pick") }) as string) ?? "";
  const line = (useWatch({ control, name: path("line") }) as string) ?? "";
  const subject = (useWatch({ control, name: path("subject") }) as string) ?? "";
  const isStructured = marketKey !== "CUSTOM";
  const pickOptions = isStructured
    ? MARKET_PICKS[marketKey as Exclude<LegMarketKey, "CUSTOM">]
    : [];
  const orderedChips = useMemo(() => sortMarketChips(), []);
  const isPickerLine = PICKER_LINE_MARKETS.includes(marketKey);

  const changeMarket = (next: LegMarketKey) => {
    setValue(path("marketKey"), next);
    setValue(path("line"), "");
    setValue(path("pick"), next === "EXACT_TOTAL_GOALS" ? "EXACT" : "");
    setValue(path("subject"), next === "TEAM_TOTAL_GOALS" ? "HOME" : "");
    try {
      const usage = readMarketUsage();
      usage[next] = (usage[next] ?? 0) + 1;
      localStorage.setItem(MARKET_USAGE_KEY, JSON.stringify(usage));
    } catch {
      // sin storage
    }

    if (next === "CUSTOM") {
      setValue(path("market"), "");
      setValue(path("selection"), "");
    } else {
      setValue(path("market"), MARKET_LABELS[next]);
      setValue(path("selection"), "");
    }

    const defaultLine =
      next === "TOTAL_CORNERS"
        ? "9.5"
        : next === "TOTAL_CARDS"
          ? "3.5"
          : next === "ASIAN_HANDICAP"
            ? "-0.5"
            : next === "EXACT_TOTAL_GOALS"
              ? "3"
              : PICKER_LINE_MARKETS.includes(next)
                ? "2.5"
                : "";
    if (defaultLine) {
      setValue(path("line"), defaultLine);
      if (next !== "EXACT_TOTAL_GOALS") {
        setValue(path("pick"), "OVER");
      }
      setValue(
        path("selection"),
        buildSelectionLabel(
          next,
          next === "EXACT_TOTAL_GOALS" ? "EXACT" : "OVER",
          defaultLine,
          next === "TEAM_TOTAL_GOALS" ? "HOME" : null,
        ),
      );
    }
  };

  const changePick = (value: string) => {
    setValue(path("pick"), value);
    setValue(
      path("selection"),
      buildSelectionLabel(marketKey, value, line, subject || null),
    );
  };

  const changeLine = (value: string) => {
    setValue(path("line"), value);
    if (pick) {
      setValue(
        path("selection"),
        buildSelectionLabel(marketKey, pick, value, subject || null),
      );
    }
  };

  const changeSubject = (next: string) => {
    setValue(path("subject"), next);
    setValue(
      path("selection"),
      buildSelectionLabel(marketKey, pick, line, next),
    );
  };

  const selectionValue =
    (useWatch({ control, name: path("selection") }) as string) ?? "";

  return (
    <div className="space-y-2 rounded-lg border bg-background p-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor={`leg-${legIndex}-sel-${selectionIndex}-market-key`}
          className="text-[11px] text-muted-foreground"
        >
          Mercado
        </Label>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label={`Eliminar selección ${selectionIndex + 1}`}
            onClick={onRemove}
            disabled={disableRemove}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      <input type="hidden" {...register(path("marketKey"))} />
      <input type="hidden" {...register(path("pick"))} />
      <input type="hidden" {...register(path("subject"))} />

      <div
        role="group"
        aria-label="Mercado"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {orderedChips.map((chip) => {
          const active = marketKey === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active}
              onClick={() => changeMarket(chip.value)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background text-muted-foreground active:bg-muted",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {isStructured ? (
        <>
          {marketKey !== "GENERIC_LINE" && (
            <input type="hidden" {...register(path("market"))} />
          )}
          <input type="hidden" {...register(path("selection"))} />

          {marketKey === "GENERIC_LINE" && (
            <Input
              aria-label="Mercado con línea"
              placeholder="Tiros a puerta, saques…"
              maxLength={80}
              required
              className="h-10"
              {...register(path("market"))}
            />
          )}

          {marketKey === "TEAM_TOTAL_GOALS" && (
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { value: "HOME", label: "Goles del local" },
                { value: "AWAY", label: "Goles del visitante" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={subject === option.value}
                  onClick={() => changeSubject(option.value)}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-lg border text-xs font-medium transition-colors",
                    subject === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-background text-muted-foreground active:bg-muted",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {isPickerLine ? (
            <LinePicker
              pick={pick}
              onPickChange={changePick}
              line={line}
              onLineChange={changeLine}
              presets={linePresets(marketKey)}
              hint={
                marketKey === "TOTAL_CORNERS"
                  ? "Córneres totales al 90′. No se auto-liquida."
                  : marketKey === "TOTAL_CARDS"
                    ? "Tarjetas totales al 90′. No se auto-liquida."
                    : marketKey === "GENERIC_LINE"
                      ? "Mercado con línea. Se liquida a mano."
                      : "Goles al 90′. Admite cuartos (2.25, 2.75…)."
              }
            />
          ) : (
            LINE_MARKETS.includes(marketKey) && (
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label
                    htmlFor={`leg-${legIndex}-sel-${selectionIndex}-line`}
                    className="text-[11px] text-muted-foreground"
                  >
                    {lineConfig(marketKey).label}
                  </Label>
                  <Input
                    id={`leg-${legIndex}-sel-${selectionIndex}-line`}
                    type="text"
                    inputMode="decimal"
                    placeholder={lineConfig(marketKey).placeholder}
                    required
                    value={line}
                    onChange={(event) => changeLine(event.target.value)}
                    className="h-10 w-24 tabular-nums"
                  />
                </div>
                <p className="pb-2.5 text-xs text-muted-foreground">
                  {lineConfig(marketKey).hint}
                </p>
              </div>
            )
          )}

          {!isPickerLine &&
            marketKey !== "EXACT_TOTAL_GOALS" &&
            pickOptions.length > 0 && (
              <div
                className={cn(
                  "grid gap-1.5",
                  pickOptions.length === 3 ? "grid-cols-3" : "grid-cols-2",
                )}
              >
                {pickOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={pick === option.value}
                    onClick={() => changePick(option.value)}
                    className={cn(
                      "flex h-10 items-center justify-center rounded-lg border px-2 text-xs font-medium transition-colors",
                      pick === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-background text-muted-foreground active:bg-muted",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

          <p className="text-[11px] text-muted-foreground">
            {selectionValue
              ? `Se guardará: ${MARKET_LABELS[marketKey]} · ${selectionValue}`
              : marketKey === "EXACT_TOTAL_GOALS"
                ? "Escribe el total exacto de goles."
                : "Elige una opción para completar la selección."}
          </p>
        </>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            aria-label="Mercado manual"
            placeholder="Ganador del partido"
            maxLength={80}
            required
            className="h-10"
            {...register(path("market"))}
          />
          <Input
            aria-label="Selección manual"
            placeholder="Alianza Lima"
            maxLength={100}
            required
            className="h-10"
            {...register(path("selection"))}
          />
        </div>
      )}
    </div>
  );
}

function SelectionsFields({
  legIndex,
  isBuilder,
  fields,
  onAppend,
  onRemove,
}: SelectionsFieldsProps) {
  const visibleFields = isBuilder ? fields : fields.slice(0, 1);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">
          {isBuilder ? "Selecciones del builder" : "Selección"}
        </Label>
        {isBuilder && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={onAppend}
            disabled={fields.length >= 20}
          >
            <Plus className="size-3.5" aria-hidden />
            Añadir selección
          </Button>
        )}
      </div>

      {visibleFields.map((field, selectionIndex) => (
        <SelectionEditor
          key={field.id}
          legIndex={legIndex}
          selectionIndex={selectionIndex}
          canRemove={isBuilder}
          disableRemove={fields.length <= 2}
          onRemove={() => onRemove(selectionIndex)}
        />
      ))}

      {isBuilder && fields.length < 2 && (
        <p className="text-xs text-destructive">
          Un Bet Builder necesita al menos 2 selecciones.
        </p>
      )}
    </div>
  );
}

type LegFieldsProps = {
  index: number;
  leg: LegValues;
  timeZone?: string;
  canRemove: boolean;
  onRemove: () => void;
  onStructureChange: () => void;
};

function LegFields({
  index,
  leg,
  timeZone,
  canRemove,
  onRemove,
  onStructureChange,
}: LegFieldsProps) {
  const { control, register, setValue } = useFormContext<BetFormValues>();
  const selectionsPath = `legs.${index}.selections` as FieldArrayPath<BetFormValues>;
  const { fields, append, remove } = useFieldArray({
    control,
    name: selectionsPath,
  });
  const isBuilder = Boolean(leg.isBuilder);
  const eventDatePath = `legs.${index}.eventDate` as FieldPath<BetFormValues>;
  const eventDateValue =
    useWatch({ control, name: eventDatePath }) ?? "";

  const toggleBuilder = (checked: boolean) => {
    setValue(`legs.${index}.isBuilder` as FieldPath<BetFormValues>, checked);

    if (checked && fields.length < 2) {
      append(emptySelection());
    }

    if (!checked && fields.length > 1) {
      remove(fields.slice(1).map((_, selectionIndex) => selectionIndex + 1));
    }

    onStructureChange();
  };

  const handleEventSelect = (event: ApiEvent) => {
    const path = (field: string) =>
      `legs.${index}.${field}` as FieldPath<BetFormValues>;
    setValue(path("eventName"), `${event.home} vs. ${event.away}`);
    setValue(path("sport"), event.sport);
    setValue(path("competition"), event.competition);
    setValue(
      path("eventDate"),
      toZonedDateTimeInput(new Date(event.kickoffUtc), timeZone),
    );
    setValue(path("externalProvider"), event.provider);
    setValue(path("externalEventId"), event.externalId);
    setValue(path("homeTeam"), event.home);
    setValue(path("awayTeam"), event.away);
  };

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Partido {index + 1}
        </p>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Eliminar
          </Button>
        )}
      </div>

      <input
        type="hidden"
        name={`legs.${index}.isBuilder`}
        value={isBuilder ? "true" : "false"}
      />
      <input
        type="hidden"
        {...register(`legs.${index}.externalProvider` as FieldPath<BetFormValues>)}
      />
      <input
        type="hidden"
        {...register(`legs.${index}.externalEventId` as FieldPath<BetFormValues>)}
      />
      <input
        type="hidden"
        {...register(`legs.${index}.homeTeam` as FieldPath<BetFormValues>)}
      />
      <input
        type="hidden"
        {...register(`legs.${index}.awayTeam` as FieldPath<BetFormValues>)}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SportField index={index} />
        <CompetitionField index={index} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`leg-${index}-event`} className="text-xs">
          Evento
        </Label>
        <Input
          id={`leg-${index}-event`}
          placeholder="Alianza Lima vs. Universitario"
          required
          maxLength={120}
          className="h-11"
          defaultValue={leg.eventName}
          {...register(
            `legs.${index}.eventName` as FieldPath<BetFormValues>,
          )}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {leg.externalEventId
              ? `Vinculado a ${leg.externalProvider ?? "proveedor"} · ${leg.homeTeam} vs. ${leg.awayTeam}`
              : "O busca el partido para auto-liquidarlo."}
          </p>
          <EventSearchSheet
            sport={leg.sport}
            competition={leg.competition}
            timeZone={timeZone}
            onSelect={handleEventSelect}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`leg-${index}-date`} className="text-xs">
            Fecha del evento (opcional)
          </Label>
          <input type="hidden" {...register(eventDatePath)} />
          <DateTimeCompact
            id={`leg-${index}-date`}
            value={String(eventDateValue)}
            onChange={(value) =>
              setValue(eventDatePath, value, { shouldDirty: true })
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`leg-${index}-odds`} className="text-xs">
            {isBuilder ? "Cuota del builder" : "Cuota del partido"}
          </Label>
          <Input
            id={`leg-${index}-odds`}
            type="text"
            inputMode="decimal"
            placeholder="1.85"
            required
            className="h-11 tabular-nums"
            defaultValue={leg.odds}
            {...register(`legs.${index}.odds` as FieldPath<BetFormValues>)}
          />
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3">
        <div className="min-w-0">
          <Label htmlFor={`leg-${index}-builder`} className="text-sm">
            Bet Builder
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Combina 2+ selecciones del mismo partido con la cuota que pone la
            casa.
          </p>
        </div>
        <Switch
          id={`leg-${index}-builder`}
          checked={isBuilder}
          onCheckedChange={toggleBuilder}
          className="mt-0.5"
        />
      </div>

      <SelectionsFields
        legIndex={index}
        isBuilder={isBuilder}
        fields={fields as Array<SelectionValues & { id: string }>}
        onAppend={() => {
          append(emptySelection());
          onStructureChange();
        }}
        onRemove={(selectionIndex) => {
          remove(selectionIndex);
          onStructureChange();
        }}
      />
    </div>
  );
}

export function BetForm({
  bankrolls,
  bookmakers,
  defaultPlacedAt,
  mode = "create",
  timeZone,
  useLastUsed = true,
  defaults,
}: BetFormProps) {
  const isEditing = mode === "edit";
  const [state, formAction, pending] = useActionState(
    isEditing ? updateBet : createBet,
    initialState,
  );

  const initialLegs = useMemo(() => buildInitialLegs(defaults), [defaults]);
  const initialMode: BetMode =
    initialLegs.length > 1 ? "COMBINED" : (defaults?.betType ?? "SINGLE");
  const initialCalculatedOdds = calculateTotalOdds(initialLegs);
  const initialManualOdds =
    defaults?.odds !== undefined &&
    Math.abs(defaults.odds - initialCalculatedOdds) > 0.0005;

  const methods = useForm<BetFormValues>({
    defaultValues: { legs: initialLegs },
  });
  const { control, reset } = methods;
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "legs",
  });
  const watchedLegs = useWatch({ control, name: "legs" }) ?? initialLegs;

  const [betMode, setBetMode] = useState<BetMode>(initialMode);
  const [bankrollId, setBankrollId] = useState(
    defaults?.bankrollId ?? bankrolls[0]?.id ?? "",
  );
  const [bookmakerId, setBookmakerId] = useState(
    defaults?.bookmakerId ?? "none",
  );
  const [stake, setStake] = useState(
    defaults?.stake !== undefined ? String(defaults.stake) : "",
  );
  const [isFreeBet, setIsFreeBet] = useState(defaults?.isFreeBet ?? false);
  const [externalIdValue, setExternalIdValue] = useState(
    defaults?.externalId ?? "",
  );
  const [placedAtValue, setPlacedAtValue] = useState(
    defaults?.placedAt ?? defaultPlacedAt,
  );
  const [oddsOverride, setOddsOverride] = useState(
    defaults?.odds !== undefined ? String(defaults.odds) : "",
  );
  const [manualOdds, setManualOdds] = useState(initialManualOdds);
  const [notes, setNotes] = useState(defaults?.notes ?? "");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [draftAvailable, setDraftAvailable] = useState<BetDraft | null>(null);
  const [lastStake, setLastStake] = useState("");
  const [draftChecked, setDraftChecked] = useState(false);
  const hydratedRef = useRef(false);

  const errors = state.fieldErrors;
  const bankroll =
    bankrolls.find((item) => item.id === bankrollId) ?? bankrolls[0];
  const currency = bankroll?.currency ?? "PEN";

  const calculatedOdds = useMemo(
    () => calculateTotalOdds(watchedLegs),
    [watchedLegs],
  );

  const totalOddsValue = manualOdds
    ? oddsOverride
    : calculatedOdds.toFixed(3);
  const oddsValue = toNumber(totalOddsValue);
  const stakeValue = toNumber(stake);
  const hasNumbers = oddsValue > 1 && stakeValue > 0;
  const potentialProfit = hasNumbers ? stakeValue * (oddsValue - 1) : 0;
  const potentialPayout = hasNumbers
    ? isFreeBet
      ? potentialProfit
      : stakeValue * oddsValue
    : 0;
  const exceedsBankroll =
    !isFreeBet &&
    bankroll !== undefined &&
    stakeValue > bankroll.currentBankroll;

  // Recupera última casa/bankroll/stake y detecta borrador.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hydratedRef.current) return;
      hydratedRef.current = true;
      if (isEditing || !useLastUsed) {
        setDraftChecked(true);
        return;
      }
      try {
        const raw = localStorage.getItem(LAST_BET_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as {
            bankrollId?: string;
            bookmakerId?: string;
            stake?: string;
            sport?: string;
            competition?: string;
          };
          if (
            !defaults?.bankrollId &&
            saved.bankrollId &&
            bankrolls.some((item) => item.id === saved.bankrollId)
          ) {
            setBankrollId(saved.bankrollId);
          }
          if (!defaults?.bookmakerId && saved.bookmakerId) {
            setBookmakerId(saved.bookmakerId);
          }
          if (defaults?.stake === undefined && saved.stake) {
            setStake(saved.stake);
          }

          let hasDraft = false;
          try {
            hasDraft = Boolean(localStorage.getItem(DRAFT_KEY));
          } catch {
            // ignorar
          }

          if (
            !hasDraft &&
            !defaults?.legs &&
            saved.sport &&
            isEmptyLeg(watchedLegs[0])
          ) {
            update(0, {
              ...emptyLeg(),
              sport: saved.sport,
              competition: saved.competition ?? "",
            });
          }
        }
        const savedStake = localStorage.getItem(LAST_STAKE_KEY);
        if (savedStake) setLastStake(savedStake);
      } catch {
        // localStorage no disponible
      }
      try {
        const draftRaw = localStorage.getItem(DRAFT_KEY);
        if (draftRaw) {
          const parsed = JSON.parse(draftRaw) as BetDraft;
          if (
            parsed &&
            Array.isArray(parsed.legs) &&
            parsed.legs.length > 0 &&
            parsed.savedAt
          ) {
            setDraftAvailable(parsed);
          }
        }
      } catch {
        // ignorar borrador corrupto
      }
      setDraftChecked(true);
    }, 0);

    return () => clearTimeout(timer);
  }, [
    isEditing,
    useLastUsed,
    defaults?.bankrollId,
    defaults?.bookmakerId,
    defaults?.stake,
    defaults?.legs,
    bankrolls,
    update,
    watchedLegs,
  ]);

  // Guarda el borrador con debounce mientras se edita (solo creación).
  useEffect(() => {
    if (isEditing || !useLastUsed || !draftChecked || draftAvailable) return;
    const timer = setTimeout(() => {
      try {
        const draft: BetDraft = {
          legs: watchedLegs,
          betMode,
          bankrollId,
          bookmakerId,
          stake,
          isFreeBet,
          externalId: externalIdValue,
          placedAt: placedAtValue,
          notes,
          savedAt: Date.now(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // sin storage
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [
    isEditing,
    useLastUsed,
    draftChecked,
    draftAvailable,
    watchedLegs,
    betMode,
    bankrollId,
    bookmakerId,
    stake,
    isFreeBet,
    externalIdValue,
    placedAtValue,
    notes,
  ]);

  const restoreDraft = () => {
    if (!draftAvailable) return;
    const draft = draftAvailable;
    reset({ legs: draft.legs });
    setBetMode(draft.betMode);
    setBankrollId(draft.bankrollId);
    setBookmakerId(draft.bookmakerId);
    setStake(draft.stake);
    setIsFreeBet(draft.isFreeBet);
    setExternalIdValue(draft.externalId);
    setPlacedAtValue(draft.placedAt);
    setNotes(draft.notes);
    setManualOdds(false);
    setOddsOverride("");
    setDraftAvailable(null);
    toast.info("Borrador restaurado");
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // sin storage
    }
    setDraftAvailable(null);
  };

  const nestedFieldErrors = Object.entries(errors ?? {})
    .filter(([key]) => key !== "bankrollId" && key !== "stake")
    .flatMap(([, messages]) => messages ?? [])
    .filter((message, index, list) => list.indexOf(message) === index);

  const changeMode = (next: BetMode) => {
    if (next === betMode) return;
    setBetMode(next);

    if (next === "SINGLE" && fields.length > 1) {
      remove(fields.slice(1).map((_, index) => index + 1));
    }

    setManualOdds(false);
  };

  const addLeg = () => {
    if (fields.length >= MAX_LEGS) return;
    append(emptyLeg());
    setManualOdds(false);
  };

  const buildLegFromEvent = (event: ApiEvent): LegValues => ({
    sport: event.sport,
    competition: event.competition,
    eventName: `${event.home} vs. ${event.away}`,
    eventDate: toZonedDateTimeInput(new Date(event.kickoffUtc), timeZone),
    isBuilder: false,
    odds: "",
    externalProvider: event.provider,
    externalEventId: event.externalId,
    homeTeam: event.home,
    awayTeam: event.away,
    selections: [emptySelection()],
  });

  const addEventsToBet = (events: ApiEvent[]) => {
    if (events.length === 0) return;
    const legs = events.map(buildLegFromEvent);
    const singleEmpty =
      betMode === "SINGLE" && fields.length === 1 && isEmptyLeg(watchedLegs[0]);

    if (singleEmpty) {
      update(0, legs[0]!);
      if (legs.length > 1) {
        append(legs.slice(1));
        setBetMode("COMBINED");
      }
    } else {
      append(legs);
      if (betMode === "SINGLE" || legs.length > 1) setBetMode("COMBINED");
    }

    setManualOdds(false);
    toast.success(
      `${events.length} partido${events.length === 1 ? "" : "s"} añadido${events.length === 1 ? "" : "s"}`,
    );
  };

  const handleSubmit = () => {
    if (typeof window !== "undefined") {
      try {
        const firstLeg = watchedLegs[0];
        localStorage.setItem(
          LAST_BET_KEY,
          JSON.stringify({
            bankrollId,
            bookmakerId,
            stake,
            sport: firstLeg?.sport ?? "",
            competition: firstLeg?.competition ?? "",
          }),
        );
        if (stake) localStorage.setItem(LAST_STAKE_KEY, stake);

        for (const leg of watchedLegs) {
          if (leg.competition) {
            const usage = JSON.parse(
              localStorage.getItem("winloss:competition-usage:v1") ?? "{}",
            ) as Record<string, number>;
            usage[leg.competition] = (usage[leg.competition] ?? 0) + 1;
            localStorage.setItem(
              "winloss:competition-usage:v1",
              JSON.stringify(usage),
            );
          }
        }
      } catch {
        // sin storage
      }
      if ("vibrate" in navigator) navigator.vibrate?.(8);
    }
  };

  const handleOcrDetected = (data: OCRTicketData) => {
    const legs: LegValues[] = data.legs.map((leg) => ({
      sport: leg.sport,
      competition: "",
      eventName: leg.eventName,
      eventDate: leg.eventDate ? leg.eventDate.slice(0, 10) : "",
      isBuilder: leg.isBuilder,
      odds: String(leg.odds),
      externalProvider: "",
      externalEventId: "",
      homeTeam: "",
      awayTeam: "",
      selections:
        leg.selections.length > 0
          ? leg.selections.map((selection) => ({
              market: selection.market,
              selection: selection.selection,
              marketKey: "CUSTOM" as LegMarketKey,
              line: "",
              pick: "",
              subject: "",
            }))
          : [emptySelection()],
    }));

    reset({ legs });
    setBetMode(legs.length > 1 ? "COMBINED" : "SINGLE");
    setStake(String(data.stake));
    setIsFreeBet(Boolean(data.isFreeBet));
    if (data.externalId) setExternalIdValue(data.externalId);
    if (data.placedAt) {
      const placedAt = new Date(data.placedAt);
      if (!Number.isNaN(placedAt.getTime())) {
        setPlacedAtValue(toZonedDateTimeInput(placedAt, timeZone));
      }
    }
    setManualOdds(false);
    setOddsOverride("");
  };

  return (
    <FormProvider {...methods}>
      <form
        action={formAction}
        onSubmit={handleSubmit}
        className="space-y-4 pb-24 md:pb-0"
      >
        {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}

        {/* Acciones rápidas */}
        <section className="grid grid-cols-2 gap-2">
          <NewBetOCRButton
            onDetected={handleOcrDetected}
            disabled={pending}
          />
          <EventSearchSheet
            sport={watchedLegs[0]?.sport || "Fútbol"}
            competition={watchedLegs[0]?.competition}
            timeZone={timeZone}
            disabled={pending}
            onSelectMany={addEventsToBet}
          />
        </section>

        {draftAvailable && (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm sm:flex-row sm:items-center"
          >
            <p className="min-w-0 flex-1 text-amber-700 dark:text-amber-300">
              Tienes un borrador sin guardar de{" "}
              {new Date(draftAvailable.savedAt).toLocaleString("es-PE", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-9"
                onClick={restoreDraft}
              >
                Restaurar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={discardDraft}
              >
                Descartar
              </Button>
            </div>
          </div>
        )}

        {state.error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{state.error}</p>
          </div>
        )}

        {nestedFieldErrors.length > 0 && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <ul className="list-inside list-disc space-y-0.5">
              {nestedFieldErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Tipo de apuesta */}
        <section className="rounded-xl border bg-card p-2 shadow-xs">
          <div
            role="tablist"
            aria-label="Tipo de apuesta"
            className="grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-1"
          >
            {(
              [
                { value: "SINGLE", label: "Simple" },
                { value: "COMBINED", label: "Múltiple" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={betMode === option.value}
                onClick={() => changeMode(option.value)}
                className={cn(
                  "h-11 rounded-md text-sm font-medium transition-colors",
                  betMode === option.value
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground active:bg-background/60",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {/* Datos del boleto (plegable) */}
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <button
            type="button"
            onClick={() => setDetailsOpen((value) => !value)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between gap-3 p-4 text-left"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">Datos del boleto</p>
              <p className="truncate text-xs text-muted-foreground">
                {bankroll?.name ?? "Bankroll"} ·{" "}
                {stakeValue > 0
                  ? formatCurrency(stakeValue, currency)
                  : "Sin stake"}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                detailsOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          {detailsOpen && (
            <div className="space-y-4 border-t p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bet-bankroll">Bankroll</Label>
                  <Select
                    name="bankrollId"
                    value={bankrollId}
                    onValueChange={setBankrollId}
                  >
                    <SelectTrigger
                      id="bet-bankroll"
                      className="h-11 w-full"
                      aria-label="Bankroll"
                      aria-invalid={Boolean(errors?.bankrollId)}
                      aria-describedby={
                        errors?.bankrollId ? "bet-bankroll-error" : undefined
                      }
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {bankrolls.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    id="bet-bankroll-error"
                    message={errors?.bankrollId?.[0]}
                  />
                  {bankroll && (
                    <p className="text-xs text-muted-foreground">
                      Disponible:{" "}
                      <span className="font-medium text-foreground">
                        {formatCurrency(bankroll.currentBankroll, currency)}
                      </span>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bet-bookmaker">Casa de apuestas</Label>
                  <Select
                    name="bookmakerId"
                    value={bookmakerId}
                    onValueChange={setBookmakerId}
                  >
                    <SelectTrigger
                      id="bet-bookmaker"
                      className="h-11 w-full"
                      aria-label="Casa de apuestas"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin casa</SelectItem>
                      {bookmakers.map((bookmaker) => (
                        <SelectItem key={bookmaker.id} value={bookmaker.id}>
                          {bookmaker.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    id="bet-bookmaker-error"
                    message={errors?.bookmakerId?.[0]}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bet-date">Fecha y hora</Label>
                  <input type="hidden" name="placedAt" value={placedAtValue} />
                  <DateTimeCompact
                    id="bet-date"
                    value={placedAtValue}
                    onChange={setPlacedAtValue}
                    required
                    aria-invalid={Boolean(errors?.placedAt)}
                    aria-describedby={
                      errors?.placedAt ? "bet-date-error" : undefined
                    }
                  />
                  <FieldError
                    id="bet-date-error"
                    message={errors?.placedAt?.[0]}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bet-total-odds">Cuota total</Label>
                  {betMode === "COMBINED" ? (
                    <>
                      <Input
                        id="bet-total-odds"
                        name="odds"
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="next"
                        placeholder="1.85"
                        required
                        value={totalOddsValue}
                        onChange={(event) => {
                          setOddsOverride(event.target.value);
                          setManualOdds(true);
                        }}
                        className="h-11 tabular-nums"
                        aria-invalid={
                          Boolean(errors?.odds) ||
                          (manualOdds && oddsValue <= 1)
                        }
                        aria-describedby={
                          errors?.odds ? "bet-total-odds-error" : undefined
                        }
                      />
                      <FieldError
                        id="bet-total-odds-error"
                        message={errors?.odds?.[0]}
                      />
                      {manualOdds &&
                        totalOddsValue.trim() !== "" &&
                        oddsValue <= 1 && (
                          <p className="text-xs text-destructive">
                            La cuota debe ser mayor que 1.00.
                          </p>
                        )}
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {manualOdds ? "Cuota editada" : "Calculada"}
                        </span>
                        {manualOdds && (
                          <button
                            type="button"
                            className="font-medium text-primary"
                            onClick={() => {
                              setManualOdds(false);
                              setOddsOverride("");
                            }}
                          >
                            Recalcular
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <input
                        type="hidden"
                        name="odds"
                        value={totalOddsValue}
                      />
                      <div
                        aria-live="polite"
                        className="flex h-11 items-center rounded-xl border border-input bg-muted/30 px-3 text-sm font-semibold tabular-nums"
                      >
                        {oddsValue > 0 ? totalOddsValue : "—"}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Se toma la cuota del partido.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bet-stake">Stake</Label>
                <Input
                  id="bet-stake"
                  name="stake"
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder="10.00"
                  required
                  value={stake}
                  onChange={(event) => setStake(event.target.value)}
                  className="h-11 tabular-nums"
                  aria-invalid={
                    Boolean(errors?.stake) ||
                    exceedsBankroll ||
                    (stake.trim() !== "" && stakeValue <= 0)
                  }
                  aria-describedby={
                    errors?.stake ? "bet-stake-error" : undefined
                  }
                />
                <FieldError id="bet-stake-error" message={errors?.stake?.[0]} />
                {stake.trim() !== "" && stakeValue <= 0 && (
                  <p className="text-xs text-destructive">
                    El stake debe ser mayor que 0.
                  </p>
                )}
                {exceedsBankroll && (
                  <p className="text-xs text-destructive">
                    Supera el saldo disponible del bankroll.
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {QUICK_STAKES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStake(String(value))}
                      className={cn(
                        "h-9 rounded-lg border px-3 text-xs font-medium tabular-nums transition-colors",
                        stakeValue === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "bg-background text-muted-foreground active:bg-muted",
                      )}
                    >
                      {formatCurrency(value, currency)}
                    </button>
                  ))}
                  {lastStake &&
                    !QUICK_STAKES.includes(
                      Number(lastStake) as (typeof QUICK_STAKES)[number],
                    ) && (
                      <button
                        type="button"
                        onClick={() => setStake(lastStake)}
                        className="h-9 rounded-lg border px-3 text-xs font-medium tabular-nums text-muted-foreground active:bg-muted"
                      >
                        Último {formatCurrency(Number(lastStake), currency)}
                      </button>
                    )}
                  {STAKE_CHIPS.map((share) => {
                    const amount = bankroll
                      ? Math.round(bankroll.currentBankroll * share * 100) / 100
                      : 0;
                    return (
                      <button
                        key={share}
                        type="button"
                        onClick={() => setStake(amount.toFixed(2))}
                        className="h-9 rounded-lg border bg-background px-3 text-xs font-medium text-muted-foreground tabular-nums active:bg-muted"
                      >
                        {formatPercent(share, { decimals: 0 })}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="min-w-0">
                  <Label htmlFor="bet-freebet" className="text-sm">
                    Free bet
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    El stake no es dinero real: no se descuenta ni se devuelve.
                  </p>
                </div>
                <Switch
                  id="bet-freebet"
                  checked={isFreeBet}
                  onCheckedChange={setIsFreeBet}
                  className="mt-0.5"
                />
              </div>
              <input
                type="hidden"
                name="isFreeBet"
                value={isFreeBet ? "true" : "false"}
              />

              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  ID del boleto (opcional)
                </summary>
                <Input
                  id="bet-external-id"
                  name="externalId"
                  placeholder="Código de la casa"
                  maxLength={80}
                  value={externalIdValue}
                  onChange={(event) => setExternalIdValue(event.target.value)}
                  className="mt-2 h-11"
                  aria-invalid={Boolean(errors?.externalId)}
                  aria-describedby={
                    errors?.externalId ? "bet-external-id-error" : undefined
                  }
                />
                <FieldError
                  id="bet-external-id-error"
                  message={errors?.externalId?.[0]}
                />
              </details>

              <div className="space-y-1.5">
                <Label htmlFor="bet-notes">Notas</Label>
                <Textarea
                  id="bet-notes"
                  name="notes"
                  placeholder="Tipster, lesiones, condiciones…"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={500}
                  rows={3}
                />
              </div>
            </div>
          )}
        </section>

        {/* Partidos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Partidos del boleto</h2>
              <p className="text-xs text-muted-foreground">
                {betMode === "SINGLE"
                  ? "Un partido. Usa Builder para combinar selecciones."
                  : `${fields.length} partido${fields.length === 1 ? "" : "s"} · máximo ${MAX_LEGS}`}
              </p>
            </div>
            {betMode === "COMBINED" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 gap-1"
                onClick={addLeg}
                disabled={fields.length >= MAX_LEGS}
              >
                <ListPlus className="size-4" aria-hidden />
                Añadir
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <LegFields
                key={field.id}
                index={index}
                leg={watchedLegs[index] ?? initialLegs[index] ?? emptyLeg()}
                timeZone={timeZone}
                canRemove={betMode === "COMBINED" && fields.length > 1}
                onRemove={() => {
                  remove(index);
                  setManualOdds(false);
                }}
                onStructureChange={() => setManualOdds(false)}
              />
            ))}
          </div>

          <datalist id="bet-sports">
            {SPORTS.map((sport) => (
              <option key={sport} value={sport} />
            ))}
          </datalist>
          <datalist id="bet-markets">
            {MARKETS.map((market) => (
              <option key={market} value={market} />
            ))}
          </datalist>
        </section>

        {/* Barra fija inferior (pulgar) */}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:rounded-xl md:border">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Cuota
              </p>
              <p className="text-base font-semibold tabular-nums">
                {oddsValue > 0 ? totalOddsValue : "—"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {isFreeBet ? "Ganancia" : "Retorno"}
              </p>
              <p
                className={cn(
                  "text-base font-semibold tabular-nums",
                  hasNumbers ? "text-success" : "text-muted-foreground",
                )}
              >
                {hasNumbers
                  ? formatCurrency(potentialPayout, currency)
                  : "—"}
              </p>
            </div>
            <Button
              type="submit"
              className="ml-auto h-12 min-w-32 flex-1"
              disabled={pending}
            >
              <Sparkles className="size-4" aria-hidden />
              {pending
                ? "Guardando…"
                : isEditing
                  ? "Guardar cambios"
                  : "Guardar"}
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            Puedes usar coma o punto decimal en cuota, línea y stake.
          </p>
        </div>
      </form>
    </FormProvider>
  );
}
