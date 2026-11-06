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
  type BetTypeFilter,
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

const TYPE_FILTERS: { label: string; value: BetTypeFilter | "all" }[] = [
  { label: "Todos", value: "all" },
  { label: "Simple", value: "single" },
  { label: "Múltiple", value: "multiple" },
  { label: "Builder", value: "builder" },
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

function parseTypeFilter(
  value?: string | string[],
): BetTypeFilter | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "single" || raw === "multiple" || raw === "builder"
    ? raw
    : undefined;
}

function firstParam(value?: string | string[]): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ?? undefined;
}

function parseDate(
  value?: string | string[],
  endOfDay = false,
): Date | undefined {
  const raw = firstParam(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
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
  tipo?: string;
}): string {
  const searchParams = new URLSearchParams();
  const estado = params.estado ?? "all";
  if (estado !== "all") searchParams.set("estado", estado);
  if (params.page > 1) searchParams.set("page", String(params.page));
  if (params.desde) searchParams.set("desde", params.desde);
  if (params.hasta) searchParams.set("hasta", params.hasta);
  if (params.sport) searchParams.set("sport", params.sport);
  if (params.tipo) searchParams.set("tipo", params.tipo);
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
  const type = parseTypeFilter(params.tipo);
  const page = parsePage(params.page);
  const from = parseDate(params.desde);
  const to = parseDate(params.hasta, true);
  const sport = firstParam(params.sport) ?? undefined;
  const hasFilters = Boolean(
    from || to || sport || type || filter !== "all",
  );

  const total = await countBetsForUser(session.user.id, {
    filter,
    type,
    from,
    to,
    sport,
  });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const [bets, counts, sports] = await Promise.all([
    getBetsForUser(session.user.id, {
      filter,
      type,
      take: PER_PAGE,
      skip: (safePage - 1) * PER_PAGE,
      from,
      to,
      sport,
    }),
    getBetCounts(session.user.id),
    getBetSports(session.user.id),
  ]);

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

      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Totales de tu historial
      </p>
      <div className="-mt-2 grid grid-cols-3 gap-2">
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

      <nav
        aria-label="Filtrar apuestas"
        className="flex gap-1 rounded-lg border bg-muted/40 p-1"
      >
        {FILTERS.map((item) => {
          const active = item.value === filter;
          return (
            <Link
              key={item.value}
              href={buildBetsHref({
                page: 1,
                estado: item.value,
                desde: firstParam(params.desde),
                hasta: firstParam(params.hasta),
                sport: firstParam(params.sport) ?? undefined,
                tipo: type,
              })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 flex-1 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground active:bg-background/60",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <nav
        aria-label="Filtrar apuestas por tipo"
        className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1"
      >
        {TYPE_FILTERS.map((item) => {
          const active = item.value === (type ?? "all");
          return (
            <Link
              key={item.value}
              href={buildBetsHref({
                page: 1,
                estado: filter,
                desde: firstParam(params.desde),
                hasta: firstParam(params.hasta),
                sport: firstParam(params.sport) ?? undefined,
                tipo: item.value === "all" ? undefined : item.value,
              })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground active:bg-background/60",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {bets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={
            hasFilters ? "No hay apuestas con estos filtros" : empty.title
          }
          description={
            hasFilters
              ? "Prueba con otro rango de fechas o deporte, o limpia los filtros."
              : empty.description
          }
          action={
            hasFilters ? (
              <Button asChild variant="outline">
                <Link href="/bets">Limpiar filtros</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/bets/new">Registrar apuesta</Link>
              </Button>
            )
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
                      tipo: type,
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
                      tipo: type,
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
