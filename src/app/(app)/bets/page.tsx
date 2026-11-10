import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Ticket, X } from "lucide-react";

import { auth } from "@/auth";
import { BetCard } from "@/components/bets/bet-card";
import { BetsFiltersSheet } from "@/components/bets/bets-filters-sheet";
import { VerifyResultsButton } from "@/components/bets/verify-results-button";
import { CreatedBetBanner } from "@/components/bets/created-bet-banner";
import { getOpenDebtSuggestion } from "@/lib/data/debts";
import { resolveHistoryMatchIds } from "@/lib/data/analysis-links";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  getBetsForUser,
  getBetSummaryForUser,
  getBetSports,
  countBetsForUser,
  type BetFilter,
  type BetOrder,
  type BetTypeFilter,
} from "@/lib/data/bets";
import { getUserPreferences } from "@/lib/data/user";
import { formatCurrency, formatPercent } from "@/lib/format";
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

function parseOrder(value?: string | string[]): BetOrder {
  const raw = firstParam(value);
  return raw === "oldest" || raw === "profit" ? raw : "recent";
}

function parseQuery(value?: string | string[]): string | undefined {
  const raw = firstParam(value)?.trim();
  return raw ? raw.slice(0, 80) : undefined;
}

function buildBetsHref(params: {
  page: number;
  estado?: string;
  desde?: string;
  hasta?: string;
  sport?: string;
  tipo?: string;
  q?: string;
  orden?: string;
}): string {
  const searchParams = new URLSearchParams();
  const estado = params.estado ?? "all";
  if (estado !== "all") searchParams.set("estado", estado);
  if (params.page > 1) searchParams.set("page", String(params.page));
  if (params.desde) searchParams.set("desde", params.desde);
  if (params.hasta) searchParams.set("hasta", params.hasta);
  if (params.sport) searchParams.set("sport", params.sport);
  if (params.tipo) searchParams.set("tipo", params.tipo);
  if (params.q) searchParams.set("q", params.q);
  if (params.orden && params.orden !== "recent") {
    searchParams.set("orden", params.orden);
  }
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
  const q = parseQuery(params.q);
  const order = parseOrder(params.orden);
  const createdId = firstParam(params.created);
  const hasFilters = Boolean(
    from || to || sport || type || q || order !== "recent" || filter !== "all",
  );

  const total = await countBetsForUser(session.user.id, {
    filter,
    type,
    from,
    to,
    sport,
    q,
  });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  const [bets, summary, sports, preferences, debtSuggestion] =
    await Promise.all([
      getBetsForUser(session.user.id, {
        filter,
        type,
        order,
        take: PER_PAGE,
        skip: (safePage - 1) * PER_PAGE,
        from,
        to,
        sport,
        q,
      }),
      getBetSummaryForUser(session.user.id, {
        filter,
        type,
        from,
        to,
        sport,
        q,
      }),
      getBetSports(session.user.id),
      getUserPreferences(session.user.id),
      getOpenDebtSuggestion(session.user.id),
    ]);

  const analysisLinks = await resolveHistoryMatchIds(
    bets
      .filter((bet) => bet.status !== "PENDING")
      .flatMap((bet) => bet.legs),
  );

  const sharedParams = {
    estado: filter,
    desde: firstParam(params.desde),
    hasta: firstParam(params.hasta),
    sport,
    tipo: type,
    q,
    orden: order,
  };
  const tabHref = (value: BetFilter) =>
    buildBetsHref({ page: 1, ...sharedParams, estado: value });

  const activeChips = [
    ...(sport
      ? [
          {
            label: `Deporte: ${sport}`,
            href: buildBetsHref({ page: 1, ...sharedParams, sport: undefined }),
          },
        ]
      : []),
    ...(firstParam(params.desde)
      ? [
          {
            label: `Desde: ${firstParam(params.desde)}`,
            href: buildBetsHref({
              page: 1,
              ...sharedParams,
              desde: undefined,
            }),
          },
        ]
      : []),
    ...(firstParam(params.hasta)
      ? [
          {
            label: `Hasta: ${firstParam(params.hasta)}`,
            href: buildBetsHref({
              page: 1,
              ...sharedParams,
              hasta: undefined,
            }),
          },
        ]
      : []),
    ...(q
      ? [
          {
            label: `Buscar: “${q}”`,
            href: buildBetsHref({ page: 1, ...sharedParams, q: undefined }),
          },
        ]
      : []),
    ...(order !== "recent"
      ? [
          {
            label:
              order === "oldest" ? "Más antiguas" : "Mayor beneficio",
            href: buildBetsHref({
              page: 1,
              ...sharedParams,
              orden: undefined,
            }),
          },
        ]
      : []),
  ];

  const empty = EMPTY_COPY[filter];

  return (
    <div className="space-y-4">
      <PageHeader
        className="pb-0"
        title="Apuestas"
        description={
          total === 0
            ? "Tu historial de picks."
            : `${total} apuesta${total === 1 ? "" : "s"} registrada${total === 1 ? "" : "s"}`
        }
        action={
          <div className="flex items-center gap-1.5">
            <VerifyResultsButton />
            <BetsFiltersSheet sports={sports} />
            <Button
              asChild
              size="icon"
              className="hidden md:inline-flex"
              aria-label="Registrar apuesta"
            >
              <Link href="/bets/new">
                <Plus className="size-5" aria-hidden />
              </Link>
            </Button>
          </div>
        }
      />

      {createdId && <CreatedBetBanner betId={createdId} />}

      <section
        aria-label="Resumen del periodo filtrado"
        className="grid grid-cols-3 divide-x rounded-xl border bg-card shadow-xs"
      >
        <div className="px-3 py-2.5 text-center">
          <p className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
            Beneficio
          </p>
          <p
            className={cn(
              "mt-0.5 text-base font-semibold tabular-nums",
              summary.profit > 0
                ? "text-success"
                : summary.profit < 0
                  ? "text-loss"
                  : "text-foreground",
            )}
          >
            {formatCurrency(summary.profit, preferences.currency)}
          </p>
        </div>
        <div className="px-3 py-2.5 text-center">
          <p className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
            ROI
          </p>
          <p
            className={cn(
              "mt-0.5 text-base font-semibold tabular-nums",
              summary.roi > 0
                ? "text-success"
                : summary.roi < 0
                  ? "text-loss"
                  : "text-foreground",
            )}
          >
            {formatPercent(summary.roi)}
          </p>
        </div>
        <div className="px-3 py-2.5 text-center">
          <p className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
            Pendientes
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums">
            {summary.pendingCount}
          </p>
        </div>
      </section>

      <nav
        aria-label="Filtrar apuestas"
        className="flex gap-1 rounded-lg bg-muted/50 p-1"
      >
        {FILTERS.map((item) => {
          const active = item.value === filter;
          return (
            <Link
              key={item.value}
              href={tabHref(item.value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 flex-1 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TYPE_FILTERS.map((item) => {
          const active = item.value === (type ?? "all");
          return (
            <Link
              key={item.value}
              href={buildBetsHref({
                page: 1,
                ...sharedParams,
                tipo: item.value === "all" ? undefined : item.value,
              })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background text-muted-foreground active:bg-muted",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {activeChips.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          aria-label="Filtros activos"
        >
          {activeChips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              className="inline-flex h-11 max-w-full items-center gap-1 rounded-full border bg-muted/40 pl-2.5 pr-1.5 text-xs font-medium text-foreground"
            >
              <span className="truncate">{chip.label}</span>
              <X className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
          <Link
            href="/bets"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Limpiar todo
          </Link>
        </div>
      )}

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
              <BetCard
                key={bet.id}
                bet={bet}
                timeZone={preferences.timezone}
                analysisLinks={analysisLinks}
                debtSuggestion={
                  preferences.showDebts ? debtSuggestion : null
                }
              />
            ))}
          </div>

          {total > PER_PAGE && (
            <nav
              aria-label="Paginación de apuestas"
              className="flex items-center justify-between gap-2"
            >
              {safePage > 1 ? (
                <Button asChild variant="outline" className="h-12 flex-1">
                  <Link
                    href={buildBetsHref({
                      page: safePage - 1,
                      ...sharedParams,
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
                <Button asChild variant="outline" className="h-12 flex-1">
                  <Link
                    href={buildBetsHref({
                      page: safePage + 1,
                      ...sharedParams,
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
