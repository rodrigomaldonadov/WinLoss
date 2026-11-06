import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";

import { BankrollCard } from "@/components/bankroll/bankroll-card";
import { NewBankrollButton } from "@/components/bankroll/new-bankroll-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { auth } from "@/auth";
import { getBankrollsForUser } from "@/lib/data/bankrolls";

export const metadata: Metadata = {
  title: "Bankroll",
};

export default async function BankrollPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const bankrolls = await getBankrollsForUser(session.user.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bankroll"
        description={
          bankrolls.length === 0
            ? "Tu capital y su evolución."
            : `${bankrolls.length} bankroll${bankrolls.length === 1 ? "" : "s"}`
        }
        action={<NewBankrollButton />}
      />

      {bankrolls.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Crea tu primer bankroll"
          description="Separa el capital que vas a dedicar a apostar. A partir de ahí mediremos tu ROI, yield y evolución."
          action={<NewBankrollButton label="Crear mi bankroll" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {bankrolls.map((bankroll) => (
            <BankrollCard key={bankroll.id} bankroll={bankroll} />
          ))}
        </div>
      )}

      <section className="rounded-xl border border-dashed bg-muted/30 p-5">
        <div className="flex size-11 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs ring-1 ring-border">
          <Wallet className="size-5" strokeWidth={1.8} aria-hidden />
        </div>
        <h2 className="mt-3 text-base font-semibold">
          ¿Por qué separar el bankroll?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Un bankroll es el dinero que apartas exclusivamente para apostar.
          Tenerlo aislado te ayuda a medir tu rentabilidad real y a controlar el
          riesgo.
        </p>
      </section>
    </div>
  );
}
