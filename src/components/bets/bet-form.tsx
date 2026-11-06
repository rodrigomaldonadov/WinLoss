"use client";

import { useActionState, useMemo, useState } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type FieldArrayPath,
  type FieldPath,
} from "react-hook-form";
import { CircleAlert, ListPlus, Plus, Sparkles, Trash2 } from "lucide-react";

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
import { createBet, updateBet, type BetFormState } from "@/lib/actions/bet";
import { MARKETS, SPORTS } from "@/lib/constants";
import { totalOdds } from "@/lib/bet-math";
import { toZonedDateTimeInput } from "@/lib/date";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { BankrollSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const initialState: BetFormState = {};

const STAKE_CHIPS = [0.02, 0.05, 0.1] as const;
const MAX_LEGS = 20;

export type BetFormLegDefaults = {
  sport?: string;
  competition?: string | null;
  eventName?: string;
  eventDate?: string | null;
  isBuilder?: boolean;
  odds?: number;
  selections?: { market: string; selection: string }[];
};

type BetFormProps = {
  bankrolls: BankrollSummary[];
  bookmakers: { id: string; name: string }[];
  defaultPlacedAt: string;
  mode?: "create" | "edit";
  timeZone?: string;
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
};

type LegValues = {
  sport: string;
  competition: string;
  eventName: string;
  eventDate: string;
  isBuilder: boolean;
  odds: string;
  selections: SelectionValues[];
};

type BetFormValues = {
  legs: LegValues[];
};

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptySelection(): SelectionValues {
  return { market: "", selection: "" };
}

function emptyLeg(): LegValues {
  return {
    sport: "",
    competition: "",
    eventName: "",
    eventDate: "",
    isBuilder: false,
    odds: "",
    selections: [emptySelection()],
  };
}

function toLegValues(leg: BetFormLegDefaults): LegValues {
  const selections =
    leg.selections && leg.selections.length > 0
      ? leg.selections.map((selection) => ({
          market: selection.market,
          selection: selection.selection,
        }))
      : [emptySelection()];

  return {
    sport: leg.sport ?? "",
    competition: leg.competition ?? "",
    eventName: leg.eventName ?? "",
    eventDate: leg.eventDate ?? "",
    isBuilder: leg.isBuilder ?? false,
    odds: leg.odds !== undefined ? String(leg.odds) : "",
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
        selections: [
          {
            market: defaults?.market ?? "",
            selection: defaults?.selection ?? "",
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

function SelectionsFields({
  legIndex,
  isBuilder,
  fields,
  onAppend,
  onRemove,
}: SelectionsFieldsProps) {
  const { register } = useFormContext<BetFormValues>();

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
        <div
          key={field.id}
          className="grid gap-2 rounded-lg border bg-background p-2.5 sm:grid-cols-[1fr_1fr_auto]"
        >
          <div className="space-y-1">
            <Label
              htmlFor={`leg-${legIndex}-sel-${selectionIndex}-market`}
              className="text-[11px] text-muted-foreground"
            >
              Mercado
            </Label>
            <Input
              id={`leg-${legIndex}-sel-${selectionIndex}-market`}
              list="bet-markets"
              placeholder="Ganador del partido"
              maxLength={80}
              required
              className="h-10"
              defaultValue={field.market}
              {...register(
                `legs.${legIndex}.selections.${selectionIndex}.market` as FieldPath<BetFormValues>,
              )}
            />
          </div>

          <div className="space-y-1">
            <Label
              htmlFor={`leg-${legIndex}-sel-${selectionIndex}-pick`}
              className="text-[11px] text-muted-foreground"
            >
              Selección
            </Label>
            <Input
              id={`leg-${legIndex}-sel-${selectionIndex}-pick`}
              placeholder="Alianza Lima"
              maxLength={100}
              required
              className="h-10"
              defaultValue={field.selection}
              {...register(
                `legs.${legIndex}.selections.${selectionIndex}.selection` as FieldPath<BetFormValues>,
              )}
            />
          </div>

          {isBuilder && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-5 size-9 text-muted-foreground"
              aria-label={`Eliminar selección ${selectionIndex + 1}`}
              onClick={() => onRemove(selectionIndex)}
              disabled={fields.length <= 2}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          )}
        </div>
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
  canRemove: boolean;
  onRemove: () => void;
  onStructureChange: () => void;
};

function LegFields({
  index,
  leg,
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`leg-${index}-sport`} className="text-xs">
            Deporte
          </Label>
          <Input
            id={`leg-${index}-sport`}
            list="bet-sports"
            placeholder="Fútbol"
            required
            maxLength={60}
            className="h-11"
            defaultValue={leg.sport}
            {...register(
              `legs.${index}.sport` as FieldPath<BetFormValues>,
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`leg-${index}-competition`} className="text-xs">
            Competición
          </Label>
          <Input
            id={`leg-${index}-competition`}
            placeholder="Liga 1"
            maxLength={80}
            className="h-11"
            defaultValue={leg.competition}
            {...register(
              `legs.${index}.competition` as FieldPath<BetFormValues>,
            )}
          />
        </div>
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`leg-${index}-date`} className="text-xs">
            Fecha del evento
          </Label>
          <Input
            id={`leg-${index}-date`}
            type="date"
            className="h-11"
            defaultValue={leg.eventDate}
            {...register(
              `legs.${index}.eventDate` as FieldPath<BetFormValues>,
            )}
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
  const { fields, append, remove } = useFieldArray({
    control,
    name: "legs",
  });
  const watchedLegs = useWatch({ control, name: "legs" }) ?? initialLegs;

  const [betMode, setBetMode] = useState<BetMode>(initialMode);
  const [bankrollId, setBankrollId] = useState(
    defaults?.bankrollId ?? bankrolls[0]?.id ?? "",
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
  const bankrollShare =
    bankroll && bankroll.currentBankroll > 0
      ? stakeValue / bankroll.currentBankroll
      : 0;
  const exceedsBankroll =
    !isFreeBet &&
    bankroll !== undefined &&
    stakeValue > bankroll.currentBankroll;

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

  const handleOcrDetected = (data: OCRTicketData) => {
    const legs: LegValues[] = data.legs.map((leg) => ({
      sport: leg.sport,
      competition: "",
      eventName: leg.eventName,
      eventDate: leg.eventDate ? leg.eventDate.slice(0, 10) : "",
      isBuilder: leg.isBuilder,
      odds: String(leg.odds),
      selections:
        leg.selections.length > 0
          ? leg.selections.map((selection) => ({
              market: selection.market,
              selection: selection.selection,
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
      <form action={formAction} className="space-y-5">
        {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}

        {!isEditing && (
          <section className="rounded-xl border border-dashed bg-muted/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Escanea tu boleto</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sube una captura y completamos legs, selecciones, cuota y
                  stake. Revisa siempre los datos antes de guardar.
                </p>
              </div>
              <NewBetOCRButton
                onDetected={handleOcrDetected}
                disabled={pending}
              />
            </div>
          </section>
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

        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
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
                  className="h-12 w-full"
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
                defaultValue={defaults?.bookmakerId ?? "none"}
              >
                <SelectTrigger
                  id="bet-bookmaker"
                  className="h-12 w-full"
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
              <Label htmlFor="bet-date">Fecha</Label>
              <Input
                id="bet-date"
                name="placedAt"
                type="datetime-local"
                value={placedAtValue}
                onChange={(event) => setPlacedAtValue(event.target.value)}
                required
                className="h-12"
                aria-invalid={Boolean(errors?.placedAt)}
                aria-describedby={
                  errors?.placedAt ? "bet-date-error" : undefined
                }
              />
              <FieldError id="bet-date-error" message={errors?.placedAt?.[0]} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bet-external-id">ID del boleto</Label>
              <Input
                id="bet-external-id"
                name="externalId"
                placeholder="Opcional"
                maxLength={80}
                value={externalIdValue}
                onChange={(event) => setExternalIdValue(event.target.value)}
                className="h-12"
                aria-invalid={Boolean(errors?.externalId)}
                aria-describedby={
                  errors?.externalId ? "bet-external-id-error" : undefined
                }
              />
              <FieldError
                id="bet-external-id-error"
                message={errors?.externalId?.[0]}
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
          <div className="space-y-2">
            <Label>Tipo de apuesta</Label>
            <div
              role="tablist"
              aria-label="Tipo de apuesta"
              className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1"
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
                    "h-10 rounded-md text-sm font-medium transition-colors",
                    betMode === option.value
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground active:bg-background/60",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Partidos del boleto</h2>
              <p className="text-xs text-muted-foreground">
                {betMode === "SINGLE"
                  ? "Un partido. Activa Bet Builder si combinas 2+ selecciones."
                  : `${fields.length} partido${fields.length === 1 ? "" : "s"} · máximo ${MAX_LEGS}`}
              </p>
            </div>
            {betMode === "COMBINED" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1"
                onClick={addLeg}
                disabled={fields.length >= MAX_LEGS}
              >
                <ListPlus className="size-4" aria-hidden />
                Añadir partido
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <LegFields
                key={field.id}
                index={index}
                leg={watchedLegs[index] ?? initialLegs[index] ?? emptyLeg()}
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

        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bet-total-odds">Cuota total</Label>
              <Input
                id="bet-total-odds"
                name="odds"
                type="text"
                inputMode="decimal"
                placeholder="1.85"
                required
                value={totalOddsValue}
                onChange={(event) => {
                  setOddsOverride(event.target.value);
                  setManualOdds(true);
                }}
                className="h-12 tabular-nums"
                aria-invalid={Boolean(errors?.odds)}
                aria-describedby={
                  errors?.odds ? "bet-total-odds-error" : undefined
                }
              />
              <FieldError
                id="bet-total-odds-error"
                message={errors?.odds?.[0]}
              />
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {manualOdds ? "Cuota editada manualmente" : "Calculada"}
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bet-stake">Stake</Label>
              <Input
                id="bet-stake"
                name="stake"
                type="text"
                inputMode="decimal"
                placeholder="10.00"
                required
                value={stake}
                onChange={(event) => setStake(event.target.value)}
                className="h-12 tabular-nums"
                aria-invalid={Boolean(errors?.stake) || exceedsBankroll}
                aria-describedby={
                  errors?.stake ? "bet-stake-error" : undefined
                }
              />
              <FieldError id="bet-stake-error" message={errors?.stake?.[0]} />
            </div>
          </div>

          {bankroll && (
            <div className="grid grid-cols-3 gap-2">
              {STAKE_CHIPS.map((share) => {
                const amount =
                  Math.round(bankroll.currentBankroll * share * 100) / 100;
                return (
                  <button
                    key={share}
                    type="button"
                    onClick={() => setStake(amount.toFixed(2))}
                    className="flex h-10 flex-col items-center justify-center rounded-lg border bg-background text-[11px] text-muted-foreground transition-colors active:bg-muted"
                  >
                    <span className="font-medium text-foreground">
                      {formatPercent(share, { decimals: 0 })}
                    </span>
                    <span className="tabular-nums">
                      {formatCurrency(amount, currency)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div
            className={cn(
              "rounded-lg border p-3",
              hasNumbers ? "bg-muted/40" : "border-dashed bg-muted/20",
            )}
            aria-live="polite"
          >
            {hasNumbers ? (
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] text-muted-foreground">
                    {isFreeBet ? "Ganancia potencial" : "Retorno potencial"}
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                    {formatCurrency(potentialPayout, currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">
                    Beneficio potencial
                  </dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums text-success">
                    +{formatCurrency(potentialProfit, currency)}
                  </dd>
                </div>
                <div className="col-span-2 flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                  <span>
                    {isFreeBet
                      ? "Free bet: no se descuenta del bankroll"
                      : `${formatPercent(bankrollShare)} de tu bankroll`}
                  </span>
                  {exceedsBankroll && (
                    <span className="font-medium text-destructive">
                      Supera el saldo
                    </span>
                  )}
                </div>
              </dl>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Ingresa cuota y stake para ver el retorno potencial.
              </p>
            )}
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

          <div className="space-y-1.5">
            <Label htmlFor="bet-notes">Notas</Label>
            <Textarea
              id="bet-notes"
              name="notes"
              placeholder="Tipster, lesiones, condiciones…"
              defaultValue={defaults?.notes ?? ""}
              maxLength={500}
              rows={3}
            />
          </div>
        </section>

        <Button type="submit" className="h-12 w-full" disabled={pending}>
          <Sparkles className="size-4" aria-hidden />
          {pending
            ? "Guardando…"
            : isEditing
              ? "Guardar cambios"
              : "Registrar apuesta"}
        </Button>

        <p className="px-1 text-center text-[11px] text-muted-foreground">
          Puedes usar coma o punto decimal en cuota y stake.
        </p>
      </form>
    </FormProvider>
  );
}
