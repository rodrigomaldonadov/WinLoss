import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Copy, Sparkles, Wallet } from "lucide-react";

import { auth } from "@/auth";
import { BetForm } from "@/components/bets/bet-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { buildAnalysisPrefill } from "@/lib/analysis/prefill";
import { getBankrollsForUser } from "@/lib/data/bankrolls";
import { getBetForUser } from "@/lib/data/bets";
import { getBookmakerOptions } from "@/lib/data/bookmakers";
import { getUserPreferences } from "@/lib/data/user";
import { toZonedDateTimeInput } from "@/lib/date";

export const metadata: Metadata = {
  title: "Nueva apuesta",
};

type NewBetPageProps = {
  searchParams: Promise<{
    copy?: string | string[];
    evento?: string | string[];
    competicion?: string | string[];
    fecha?: string | string[];
    deporte?: string | string[];
    origen?: string | string[];
    analisis?: string | string[];
    mercadoKey?: string | string[];
    mercado?: string | string[];
    seleccion?: string | string[];
    pick?: string | string[];
    linea?: string | string[];
    cuota?: string | string[];
    subject?: string | string[];
  }>;
};

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewBetPage({ searchParams }: NewBetPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const copyId = firstParam(params.copy);
  const prefill = buildAnalysisPrefill({
    evento: firstParam(params.evento),
    competicion: firstParam(params.competicion),
    fecha: firstParam(params.fecha),
    deporte: firstParam(params.deporte),
    mercadoKey: firstParam(params.mercadoKey),
    mercado: firstParam(params.mercado),
    seleccion: firstParam(params.seleccion),
    pick: firstParam(params.pick),
    linea: firstParam(params.linea),
    cuota: firstParam(params.cuota),
    subject: firstParam(params.subject),
  });
  const prefillOrigin = firstParam(params.origen)?.trim() || "Consenso";
  const analysisId = firstParam(params.analisis);
  const analysisHref =
    analysisId && /^[a-z0-9]+$/i.test(analysisId)
      ? `/analysis/${analysisId}`
      : null;
  const prefillSelection = prefill?.legs?.[0]?.selections?.[0];
  const hasMarketPrefill = Boolean(
    prefillSelection &&
      (prefillSelection.marketKey !== "CUSTOM" ||
        prefillSelection.market.trim().length > 0),
  );

  const [bankrolls, bookmakers, copiedBet, preferences] = await Promise.all([
    getBankrollsForUser(session.user.id),
    getBookmakerOptions(session.user.id),
    copyId ? getBetForUser(session.user.id, copyId) : Promise.resolve(null),
    getUserPreferences(session.user.id),
  ]);

  const activeBankrolls = bankrolls.filter((bankroll) => bankroll.isActive);
  const copiedBankrollId =
    copiedBet && activeBankrolls.some((item) => item.id === copiedBet.bankrollId)
      ? copiedBet.bankrollId
      : undefined;
  const copiedBookmakerId =
    copiedBet &&
    bookmakers.some((item) => item.id === copiedBet.bookmakerId)
      ? copiedBet.bookmakerId
      : undefined;

  const betDefaults = copiedBet
    ? {
        bankrollId: copiedBankrollId,
        bookmakerId: copiedBookmakerId ?? null,
        betType: copiedBet.betType,
        odds: copiedBet.odds,
        isFreeBet: false,
        oddsBoostPct: copiedBet.oddsBoostPct,
        legs: copiedBet.legs.map((leg) => ({
          sport: leg.sport,
          competition: leg.competition,
          eventName: leg.eventName,
          eventDate: leg.eventDate
            ? leg.eventDate.toISOString().slice(0, 10)
            : null,
          isBuilder: leg.isBuilder,
          odds: leg.odds,
          selections: leg.selections.map((selection) => ({
            market: selection.market,
            selection: selection.selection,
            marketKey: selection.marketKey,
            line: selection.line,
            pick: selection.pick,
            subject: selection.subject,
          })),
        })),
      }
    : (prefill ?? undefined);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href="/bets">
            <ArrowLeft className="size-4" aria-hidden />
            Volver
          </Link>
        </Button>
      </div>

      <PageHeader
        title={copiedBet ? "Duplicar apuesta" : "Nueva apuesta"}
        description={
          copiedBet
            ? "Revisa el pick y define el nuevo stake."
            : prefill
              ? "Revisa el partido precargado y define mercado, selección y stake."
              : "Registra el pick y controla su liquidación."
        }
      />

      {activeBankrolls.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Primero crea tu bankroll"
          description="Cada apuesta se descuenta de un bankroll concreto. Crea uno para poder registrar picks."
          action={
            <Button asChild>
              <Link href="/bankroll">Ir a Bankroll</Link>
            </Button>
          }
        />
      ) : (
        <>
          {copiedBet && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary"
            >
              <Copy className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Duplicando <strong>{copiedBet.eventName}</strong>. El stake, la
                fecha y el estado de liquidación no se copian.
              </p>
            </div>
          )}

          {!copiedBet && prefill && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary"
            >
              <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Precargado desde <strong>{prefillOrigin}</strong>:{" "}
                <strong>{prefill.eventName}</strong>
                {prefill.competition ? ` (${prefill.competition})` : ""}.{" "}
                {hasMarketPrefill
                  ? "Mercado y selección precargados; la cuota la defines tú."
                  : "La cuota, el mercado y la selección los defines tú."}
                {analysisHref && (
                  <>
                    {" "}
                    <Link
                      href={analysisHref}
                      className="font-medium underline underline-offset-4"
                    >
                      Ver análisis
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
          )}

          <BetForm
            bankrolls={activeBankrolls}
            bookmakers={bookmakers}
            defaultPlacedAt={toZonedDateTimeInput(
              new Date(),
              preferences.timezone,
            )}
            timeZone={preferences.timezone}
            useLastUsed={!copiedBet && !prefill}
            defaults={betDefaults}
          />
        </>
      )}
    </div>
  );
}