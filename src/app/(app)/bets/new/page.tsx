import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";

import { auth } from "@/auth";
import { BetForm } from "@/components/bets/bet-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getBankrollsForUser } from "@/lib/data/bankrolls";
import { getBookmakerOptions } from "@/lib/data/bookmakers";
import { toZonedDateTimeInput } from "@/lib/date";

export const metadata: Metadata = {
  title: "Nueva apuesta",
};

export default async function NewBetPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [bankrolls, bookmakers] = await Promise.all([
    getBankrollsForUser(session.user.id),
    getBookmakerOptions(session.user.id),
  ]);

  const activeBankrolls = bankrolls.filter((bankroll) => bankroll.isActive);

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/bets">
          <ArrowLeft className="size-4" aria-hidden />
          Volver
        </Link>
      </Button>

      <PageHeader
        title="Nueva apuesta"
        description="Registra el pick y controla su liquidación."
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
        <BetForm
          bankrolls={activeBankrolls}
          bookmakers={bookmakers}
          defaultPlacedAt={toZonedDateTimeInput(new Date())}
        />
      )}
    </div>
  );
}
