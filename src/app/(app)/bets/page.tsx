import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Ticket } from "lucide-react";

import { auth } from "@/auth";
import { BetCard } from "@/components/bets/bet-card";
import { BetsFiltersSheet } from "@/components/bets/bets-filters-sheet";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  getBetsForUser,
  getBetCounts,
  getBetSports,
  countBetsForUser,
  type BetFilter,
} from "@/lib/data/bets";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Apuestas",
};

const FILTERS: { label: string; value: BetFilter }[] = [
  { label: "Todas", value: "all" },
  { label: "Pendientes", value: "pending" },
  { label: "Liquidadas", value: "settled" },
];

const EMPTY_COPY: Record<
  BetFilter,
  { title: string; description: string }
> = {
  all: {
    title: "Todavía no hay apuestas",
    description:
      "Cuando registres una apuesta verás aquí su estado, cuota, stake y beneficio.",
  },
  pending: {
    title: "No hay apuestas pendientes",
    description: "Todo liquidado. Registra un nuevo pick para seguir midiendo.",
  },
  settled: {
    title: "Aún no has liquidado apuestas",
    description:
      "Liquida tus apuestas pendientes para conocer tu beneficio real.",
  },
};

const PER_PAGE = 20;

function parseFilter(value?: string | string[]): BetFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "pending" || raw === "settled" ? raw : "all";
}

function firstParam(value?: string | string[]): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? undefined;
}

function parseDate(value?: string | string[]): Date | undefined {
  const raw = firstParam(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parsePage(value?: string | string[]): number {
  const raw = firstParam(value);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildBetsHref(params: {
  page: number;
  estado?: string;
  desde?: string;
  hasta?: string;
  sport?: string;
}): string {
  const searchParams = new URLSearchParams();
  const estado = params.estado ?? "all";
  if (estado !== "all") searchParams.set("estado", estado);
  if (params.page > 1) searchParams.set("page", String(params.page));
  if (params.desde) searchParams.set("desde", params.desde);
  if (params.hasta) searchParams.set("hasta", params.hasta);
  if (params.sport) searchParams.set("sport", params.sport);
  const qs = searchParams.toString();
  return qs ? `/bets?${qs}` : "/bets";
}

type BetsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BetsPage({ searchParams }: BetsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const filter = parseFilter(params.estado);
  const page = parsePage(params.page);
  const from = parseDate(params.desde);
  const to = parseDate(params.hasta);
  const sport = firstParam(params.sport) ?? undefined;

  const [bets, counts, sports, total] = await Promise.all([
    getBetsForUser(session.user.id, {
      filter,
      take: PER_PAGE,
      skip: (page - 1) * PER_PAGE,
      from,
      to,
      sport,
    }),
    getBetCounts(session.user.id),
    getBetSports(session.user.id),
    countBetsForUser(session.user.id, { filter, from, to, sport }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const empty = EMPTY_COPY[filter];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Apuestas"
        description={
          total === 0
            ? "Tu historial de picks."
            : `${total} apuesta${total === 1 ? "" : "s"} registrada${total === 1 ? "" : "s"}`
        }
        action={
          <div className="flex items-center gap-2">
            <Button asChild size="icon" aria-label="Registrar apuesta">
              <Link href="/bets/new">
                <Plus className="size-5" aria-hidden />
              </Link>
            </Button>
            <BetsFiltersSheet sports={sports} />
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border bg-card px-3 py-2.5 text-center shadow-xs">
          <p className="text-lg font-semibold tabular-nums">
            {counts.pendingCount}
          </p>
          <p className="text-[11px] text-muted-foreground">Pendientes</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2.5 text-center shadow-xs">
          <p className="text-lg font-semibold tabular-nums text-success">
            {counts.wonCount}
          </p>
          <p className="text-[11px] text-muted-foreground">Ganadas</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2.5 text-center shadow-xs">
          <p className="text-lg font-semibold tabular-nums text-loss">
            {counts.lostCount}
          </p>
          <p className="text-[11px] text-muted-foreground">Perdidas</p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Filtrar apuestas"
        className="flex gap-1 rounded-lg border bg-muted/40 p-1"
      >
        {FILTERS.map((item) => {
          const active = item.value === filter;
          return (
            <Link
              key={item.value}
              href={
                item.value === "all"
                  ? "/bets"
                  : `/bets?estado=${item.value}&page=1`
              }
              role="tab"
              aria-selected={active}
              className={cn(
                "flex h-10 flex-1 items-center justify-center rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground active:bg-background/60",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {bets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={empty.title}
          description={empty.description}
          action={
            <Button asChild>
              <Link href="/bets/new">Registrar apuesta</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {bets.map((bet) => (
              <BetCard key={bet.id} bet={bet} />
            ))}
          </div>

          {total > PER_PAGE && (
            <nav
              aria-label="Paginación de apuestas"
              className="flex items-center justify-between gap-2"
            >
              {safePage > 1 ? (
                <Button asChild variant="outline" className="h-11 flex-1">
                  <Link
                    href={buildBetsHref({
                      page: safePage - 1,
                      estado: filter,
                      desde: firstParam(params.desde),
                      hasta: firstParam(params.hasta),
                      sport: firstParam(params.sport) ?? undefined,
                    })}
                  >
                    ← Anterior
                  </Link>
                </Button>
              ) : (
                <span className="flex-1" />
              )}
              <p className="text-xs text-muted-foreground tabular-nums">
                Página {safePage} de {totalPages}
              </p>
              {safePage < totalPages ? (
                <Button asChild variant="outline" className="h-11 flex-1">
                  <Link
                    href={buildBetsHref({
                      page: safePage + 1,
                      estado: filter,
                      desde: firstParam(params.desde),
                      hasta: firstParam(params.hasta),
                      sport: firstParam(params.sport) ?? undefined,
                    })}
                  >
                    Siguiente →
                  </Link>
                </Button>
              ) : (
                <span className="flex-1" />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
