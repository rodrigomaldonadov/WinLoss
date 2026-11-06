import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Store } from "lucide-react";

import { auth } from "@/auth";
import { BookmakerCard } from "@/components/bookmakers/bookmaker-card";
import { NewBookmakerButton } from "@/components/bookmakers/new-bookmaker-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getBookmakersForUser } from "@/lib/data/bookmakers";

export const metadata: Metadata = {
  title: "Casas de apuestas",
};

export default async function BookmakersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const bookmakers = await getBookmakersForUser(session.user.id);

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/settings">
          <ArrowLeft className="size-4" aria-hidden />
          Ajustes
        </Link>
      </Button>

      <PageHeader
        title="Casas de apuestas"
        description={
          bookmakers.length === 0
            ? "Añade las casas donde apuestas."
            : `${bookmakers.length} casa${bookmakers.length === 1 ? "" : "s"}`
        }
        action={<NewBookmakerButton />}
      />

      {bookmakers.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin casas de apuestas"
          description="Registra tus casas para saber dónde estás ganando y comparar cuotas."
          action={<NewBookmakerButton label="Añadir la primera" />}
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {bookmakers.map((bookmaker) => (
            <BookmakerCard key={bookmaker.id} bookmaker={bookmaker} />
          ))}
        </ul>
      )}
    </div>
  );
}
