import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Ticket } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Apuestas",
};

const filters = [
  { label: "Pendientes", value: 0 },
  { label: "Ganadas", value: 0 },
  { label: "Perdidas", value: 0 },
] as const;

export default function BetsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Apuestas"
        description="0 apuestas registradas"
        action={
          <Button asChild size="icon" aria-label="Registrar apuesta">
            <Link href="/bets/new">
              <Plus className="size-5" aria-hidden />
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        {filters.map((filter) => (
          <div
            key={filter.label}
            className="rounded-lg border bg-card px-3 py-2.5 text-center shadow-xs"
          >
            <p className="text-lg font-semibold tabular-nums">{filter.value}</p>
            <p className="text-[11px] text-muted-foreground">{filter.label}</p>
          </div>
        ))}
      </div>

      <EmptyState
        icon={Ticket}
        title="Todavía no hay apuestas"
        description="Cuando registres una apuesta verás aquí su estado, cuota, stake y beneficio."
        action={
          <Button asChild>
            <Link href="/bets/new">Registrar apuesta</Link>
          </Button>
        }
      />
    </div>
  );
}
