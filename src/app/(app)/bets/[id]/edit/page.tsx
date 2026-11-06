import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";

import { auth } from "@/auth";
import { BetForm } from "@/components/bets/bet-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getBetForUser } from "@/lib/data/bets";
import { getBankrollsForUser } from "@/lib/data/bankrolls";
import { getBookmakersForUser } from "@/lib/data/bookmakers";
import { getUserPreferences } from "@/lib/data/user";
import { toZonedDateTimeInput } from "@/lib/date";
import { BET_STATUS_LABELS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Editar apuesta",
};

type EditBetPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditBetPage({ params }: EditBetPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const bet = await getBetForUser(session.user.id, id);

  if (!bet) notFound();

  const [bankrolls, bookmakers, preferences] = await Promise.all([
    getBankrollsForUser(session.user.id),
    getBookmakersForUser(session.user.id),
    getUserPreferences(session.user.id),
  ]);

  // Un bankroll archivado sigue disponible al editar para no romper historial.
  const availableBankrolls = bankrolls.filter(
    (bankroll) => bankroll.isActive || bankroll.id === bet.bankrollId,
  );

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/bets">
          <ArrowLeft className="size-4" aria-hidden />
          Volver
        </Link>
      </Button>

      <PageHeader
        title="Editar apuesta"
        description={`${bet.eventName} · ${bet.market}`}
      />

      {bet.status !== "PENDING" && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Esta apuesta está liquidada como{" "}
            <strong>{BET_STATUS_LABELS[bet.status]}</strong>. Al guardar
            recalcularemos su payout, beneficio, bankroll y ROI.
          </p>
        </div>
      )}

      <BetForm
        mode="edit"
        bankrolls={availableBankrolls}
        bookmakers={bookmakers.map(({ id: bookmakerId, name }) => ({
          id: bookmakerId,
          name,
        }))}
        defaultPlacedAt={toZonedDateTimeInput(
          bet.placedAt,
          preferences.timezone,
        )}
        timeZone={preferences.timezone}
        defaults={{
          id: bet.id,
          bankrollId: bet.bankrollId,
          bookmakerId: bet.bookmakerId,
          externalId: bet.externalId,
          betType: bet.betType,
          odds: bet.odds,
          stake: bet.stake,
          isFreeBet: bet.isFreeBet,
          placedAt: toZonedDateTimeInput(bet.placedAt, preferences.timezone),
          notes: bet.notes,
          legs: bet.legs.map((leg) => ({
            sport: leg.sport,
            competition: leg.competition,
            eventName: leg.eventName,
            eventDate: leg.eventDate
              ? toZonedDateTimeInput(leg.eventDate, preferences.timezone)
              : null,
            isBuilder: leg.isBuilder,
            odds: leg.odds,
            externalProvider: leg.externalProvider,
            externalEventId: leg.externalEventId,
            homeTeam: leg.homeTeam,
            awayTeam: leg.awayTeam,
            selections: leg.selections.map((selection) => ({
              market: selection.market,
              selection: selection.selection,
              marketKey: selection.marketKey,
              line: selection.line,
              pick: selection.pick,
              subject: selection.subject,
            })),
          })),
        }}
      />
    </div>
  );
}
