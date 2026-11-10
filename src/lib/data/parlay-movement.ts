import "server-only";

import type { ParlayEvent, ParlayMovement } from "@/lib/parlay/analysis";
import { prisma } from "@/lib/prisma";

const MIN_INTERVAL_MS = 10 * 60 * 1000;
const MAX_ROWS = 500;

/**
 * Guarda una foto de las cuotas 1X2 del partido. Se llama al abrir
 * Investigar; si la última captura es reciente no duplica filas.
 */
export async function recordParlaySnapshot(
  event: ParlayEvent,
  sportKey: string,
): Promise<void> {
  const last = await prisma.parlayOddsSnapshot.findFirst({
    where: { eventId: event.id },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });
  if (last && Date.now() - last.capturedAt.getTime() < MIN_INTERVAL_MS) {
    return;
  }

  const eventName = `${event.home_team} vs ${event.away_team}`;
  const rows: {
    sportKey: string;
    eventId: string;
    eventName: string;
    market: string;
    outcome: string;
    bookmaker: string;
    price: number;
  }[] = [];

  for (const book of event.bookmakers) {
    const market = book.markets.find((item) => item.key === "h2h");
    if (!market) continue;
    for (const outcome of market.outcomes) {
      rows.push({
        sportKey,
        eventId: event.id,
        eventName,
        market: "h2h",
        outcome: outcome.name,
        bookmaker: book.title,
        price: outcome.price,
      });
    }
  }

  if (rows.length > 0) {
    await prisma.parlayOddsSnapshot.createMany({ data: rows });
  }
}

/** Última y penúltima cuota por casa y resultado. */
export async function getParlayMovement(
  eventId: string,
): Promise<ParlayMovement> {
  const rows = await prisma.parlayOddsSnapshot.findMany({
    where: { eventId, market: "h2h" },
    orderBy: { capturedAt: "desc" },
    take: MAX_ROWS,
    select: {
      bookmaker: true,
      outcome: true,
      price: true,
      capturedAt: true,
    },
  });

  const grouped = new Map<
    string,
    { price: number; capturedAt: Date }[]
  >();

  for (const row of rows) {
    const key = `${row.bookmaker}|${row.outcome}`;
    const list = grouped.get(key) ?? [];
    if (list.length >= 2) continue;
    list.push({ price: Number(row.price), capturedAt: row.capturedAt });
    grouped.set(key, list);
  }

  const movement: ParlayMovement = {};
  for (const [key, [latest, previous]] of grouped) {
    if (!latest) continue;
    movement[key] = {
      price: latest.price,
      previous: previous?.price ?? null,
      capturedAt: latest.capturedAt.toISOString(),
      previousAt: previous?.capturedAt.toISOString() ?? null,
    };
  }
  return movement;
}
