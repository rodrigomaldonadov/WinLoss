import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";

import { auth } from "@/auth";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { countUserBankrolls } from "@/lib/data/bankrolls";

export const metadata: Metadata = {
  title: "Nueva apuesta",
};

export default async function NewBetPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const bankrollCount = await countUserBankrolls(session.user.id);

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

      {bankrollCount === 0 ? (
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
        <section className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
          <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            Siguiente paso
          </span>
          <h2 className="mt-3 text-base font-semibold">
            El formulario de alta llega ahora
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-balance text-muted-foreground">
            Ya tienes bankroll. En la Fase 3 conectamos el formulario completo:
            evento, mercado, cuota, stake, casa de apuestas y liquidación.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/bankroll">Ver mis bankrolls</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
