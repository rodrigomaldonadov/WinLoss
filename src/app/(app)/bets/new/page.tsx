import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Copy, Wallet } from "lucide-react";

import { auth } from "@/auth";
import { BetForm } from "@/components/bets/bet-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getBankrollsForUser } from "@/lib/data/bankrolls";
import { getBetForUser } from "@/lib/data/bets";
import { getBookmakerOptions } from "@/lib/data/bookmakers";
import { toZonedDateTimeInput } from "@/lib/date";

export const metadata: Metadata = {
  title: "Nueva apuesta",
};

type NewBetPageProps = {
  searchParams: Promise<{ copy?: string | string[] }>;
};

export default async function NewBetPage({ searchParams }: NewBetPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const copyId = Array.isArray(params.copy) ? params.copy[0] : params.copy;

  const [bankrolls, bookmakers, copiedBet] = await Promise.all([
    getBankrollsForUser(session.user.id),
    getBookmakerOptions(session.user.id),
    copyId ? getBetForUser(session.user.id, copyId) : Promise.resolve(null),
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

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/bets">
          <ArrowLeft className="size-4" aria-hidden />
          Volver
        </Link>
      </Button>

      <PageHeader
        title={copiedBet ? "Duplicar apuesta" : "Nueva apuesta"}
        description={
          copiedBet
            ? "Revisa el pick y define el nuevo stake."
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

          <BetForm
            bankrolls={activeBankrolls}
            bookmakers={bookmakers}
            defaultPlacedAt={toZonedDateTimeInput(new Date())}
            defaults={
              copiedBet
                ? {
                    bankrollId: copiedBankrollId,
                    bookmakerId: copiedBookmakerId ?? null,
                    betType: copiedBet.betType,
                    sport: copiedBet.sport,
                    competition: copiedBet.competition,
                    eventName: copiedBet.eventName,
                    market: copiedBet.market,
                    selection: copiedBet.selection,
                    odds: copiedBet.odds,
                    isFreeBet: false,
                  }
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}
