"use client";

import { useActionState, useState } from "react";
import { CircleAlert, Sparkles } from "lucide-react";

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
import { createBet, updateBet, type BetFormState } from "@/lib/actions/bet";
import {
  BET_TYPE_LABELS,
  MARKETS,
  SPORTS,
} from "@/lib/constants";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { BankrollSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const initialState: BetFormState = {};

const STAKE_CHIPS = [0.02, 0.05, 0.1] as const;

type BetFormProps = {
  bankrolls: BankrollSummary[];
  bookmakers: { id: string; name: string }[];
  defaultPlacedAt: string;
  mode?: "create" | "edit";
  defaults?: BetFormDefaults;
};

export type BetFormDefaults = {
  id?: string;
  bankrollId?: string;
  bookmakerId?: string | null;
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
};

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function BetForm({
  bankrolls,
  bookmakers,
  defaultPlacedAt,
  mode = "create",
  defaults,
}: BetFormProps) {
  const isEditing = mode === "edit";
  const [state, formAction, pending] = useActionState(
    isEditing ? updateBet : createBet,
    initialState,
  );
  const [bankrollId, setBankrollId] = useState(
    defaults?.bankrollId ?? bankrolls[0]?.id ?? "",
  );
  const [odds, setOdds] = useState(
    defaults?.odds !== undefined ? String(defaults.odds) : "",
  );
  const [stake, setStake] = useState(
    defaults?.stake !== undefined ? String(defaults.stake) : "",
  );
  const [isFreeBet, setIsFreeBet] = useState(defaults?.isFreeBet ?? false);

  const errors = state.fieldErrors;
  const bankroll =
    bankrolls.find((item) => item.id === bankrollId) ?? bankrolls[0];
  const currency = bankroll?.currency ?? "PEN";

  const oddsValue = toNumber(odds);
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

  return (
    <form action={formAction} className="space-y-5">
      {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}

      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{state.error}</p>
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
            <Label htmlFor="bet-type">Tipo</Label>
            <Select name="betType" defaultValue={defaults?.betType ?? "SINGLE"}>
              <SelectTrigger
                id="bet-type"
                className="h-12 w-full"
                aria-label="Tipo de apuesta"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SINGLE">{BET_TYPE_LABELS.SINGLE}</SelectItem>
                <SelectItem value="COMBINED">
                  {BET_TYPE_LABELS.COMBINED}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bet-date">Fecha</Label>
            <Input
              id="bet-date"
              name="placedAt"
              type="datetime-local"
              defaultValue={defaults?.placedAt ?? defaultPlacedAt}
              required
              className="h-12"
              aria-invalid={Boolean(errors?.placedAt)}
              aria-describedby={
                errors?.placedAt ? "bet-date-error" : undefined
              }
            />
            <FieldError id="bet-date-error" message={errors?.placedAt?.[0]} />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
        <div>
          <h2 className="text-sm font-semibold">El pick</h2>
          <p className="text-xs text-muted-foreground">
            Describe el evento y la selección que registraste.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bet-sport">Deporte</Label>
            <Input
              id="bet-sport"
              name="sport"
              list="bet-sports"
              placeholder="Fútbol"
              defaultValue={defaults?.sport}
              required
              maxLength={60}
              className="h-12"
              aria-invalid={Boolean(errors?.sport)}
              aria-describedby={
                errors?.sport ? "bet-sport-error" : undefined
              }
            />
            <datalist id="bet-sports">
              {SPORTS.map((sport) => (
                <option key={sport} value={sport} />
              ))}
            </datalist>
            <FieldError id="bet-sport-error" message={errors?.sport?.[0]} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bet-competition">Competición</Label>
            <Input
              id="bet-competition"
              name="competition"
              placeholder="Liga 1"
              defaultValue={defaults?.competition ?? ""}
              maxLength={80}
              className="h-12"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bet-event">Evento</Label>
          <Input
            id="bet-event"
            name="eventName"
            placeholder="Alianza Lima vs. Universitario"
            defaultValue={defaults?.eventName}
            required
            maxLength={120}
            className="h-12"
            aria-invalid={Boolean(errors?.eventName)}
            aria-describedby={errors?.eventName ? "bet-event-error" : undefined}
          />
          <FieldError id="bet-event-error" message={errors?.eventName?.[0]} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bet-market">Mercado</Label>
            <Input
              id="bet-market"
              name="market"
              list="bet-markets"
              placeholder="Ganador del partido"
              defaultValue={defaults?.market}
              required
              maxLength={80}
              className="h-12"
              aria-invalid={Boolean(errors?.market)}
              aria-describedby={
                errors?.market ? "bet-market-error" : undefined
              }
            />
            <datalist id="bet-markets">
              {MARKETS.map((market) => (
                <option key={market} value={market} />
              ))}
            </datalist>
            <FieldError id="bet-market-error" message={errors?.market?.[0]} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bet-selection">Selección</Label>
            <Input
              id="bet-selection"
              name="selection"
              placeholder="Alianza Lima"
              defaultValue={defaults?.selection}
              required
              maxLength={100}
              className="h-12"
              aria-invalid={Boolean(errors?.selection)}
              aria-describedby={
                errors?.selection ? "bet-selection-error" : undefined
              }
            />
            <FieldError
              id="bet-selection-error"
              message={errors?.selection?.[0]}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bet-odds">Cuota</Label>
            <Input
              id="bet-odds"
              name="odds"
              type="text"
              inputMode="decimal"
              placeholder="1.85"
              required
              value={odds}
              onChange={(event) => setOdds(event.target.value)}
              className="h-12 tabular-nums"
              aria-invalid={Boolean(errors?.odds)}
              aria-describedby={errors?.odds ? "bet-odds-error" : undefined}
            />
            <FieldError id="bet-odds-error" message={errors?.odds?.[0]} />
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
              aria-describedby={errors?.stake ? "bet-stake-error" : undefined}
            />
            <FieldError id="bet-stake-error" message={errors?.stake?.[0]} />
          </div>
        </div>

        {bankroll && (
          <div className="grid grid-cols-3 gap-2">
            {STAKE_CHIPS.map((share) => {
              const amount = Math.round(bankroll.currentBankroll * share * 100) / 100;
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
            name="isFreeBet"
            value="true"
            checked={isFreeBet}
            onCheckedChange={setIsFreeBet}
            className="mt-0.5"
          />
        </div>

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
  );
}
