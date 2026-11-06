import {
  aggregateConsensus,
  type ConsensusHistoryLegInput,
  type ConsensusResult,
} from "@/lib/consensus";
import { prisma } from "@/lib/prisma";

export type ConsensusScope = "community" | "mine";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Consenso de picks para partidos próximos.
 *
 * En `community` se agregan los picks de todos los usuarios, pero solo se
 * devuelven conteos: nunca nombres, correos ni boletos individuales.
 */
export async function getUpcomingConsensus(
  userId: string,
  {
    scope,
    days,
    now = new Date(),
  }: {
    scope: ConsensusScope;
    days: number;
    now?: Date;
  },
): Promise<ConsensusResult> {
  const until = new Date(now.getTime() + days * DAY_MS);

  const [legs, historyLegs] = await Promise.all([
    prisma.betLeg.findMany({
      where: {
        status: "PENDING",
        eventDate: { gte: now, lte: until },
        bet: {
          status: "PENDING",
          ...(scope === "mine" ? { userId } : {}),
        },
      },
      select: {
        eventName: true,
        eventDate: true,
        sport: true,
        competition: true,
        odds: true,
        isBuilder: true,
        bet: { select: { userId: true } },
        selections: {
          select: {
            market: true,
            selection: true,
            marketKey: true,
            line: true,
            pick: true,
            subject: true,
          },
        },
      },
    }),
    prisma.betLeg.findMany({
      where: {
        status: { in: ["WON", "LOST", "HALF_WON", "HALF_LOST"] },
        // Los builders tienen un resultado combinado: no se puede atribuir a
        // cada selección, así que se excluyen del histórico por mercado.
        isBuilder: false,
        ...(scope === "mine" ? { bet: { userId } } : {}),
      },
      select: {
        status: true,
        odds: true,
        isBuilder: true,
        selections: {
          select: {
            market: true,
            selection: true,
            marketKey: true,
            line: true,
            pick: true,
            subject: true,
          },
        },
      },
      orderBy: { eventDate: "desc" },
      take: 2000,
    }),
  ]);

  const history: ConsensusHistoryLegInput[] = historyLegs.map((leg) => ({
    odds: Number(leg.odds),
    isBuilder: leg.isBuilder,
    status: leg.status,
    selections: leg.selections.map((selection) => ({
      market: selection.market,
      selection: selection.selection,
      marketKey: selection.marketKey,
      line: selection.line === null ? null : Number(selection.line),
      pick: selection.pick,
      subject: selection.subject,
    })),
  }));

  return aggregateConsensus(
    legs.map((leg) => ({
      eventName: leg.eventName,
      eventDate: leg.eventDate,
      sport: leg.sport,
      competition: leg.competition,
      odds: Number(leg.odds),
      isBuilder: leg.isBuilder,
      userId: leg.bet.userId,
      selections: leg.selections.map((selection) => ({
        market: selection.market,
        selection: selection.selection,
        marketKey: selection.marketKey,
        line: selection.line === null ? null : Number(selection.line),
        pick: selection.pick,
        subject: selection.subject,
      })),
    })),
    { now, days, history },
  );
}
