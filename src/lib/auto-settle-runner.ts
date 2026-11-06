import "server-only";

import type { AutoSettleMode, BetStatus, LegStatus } from "@prisma/client";

import { resolveLegStatus } from "@/lib/auto-settle";
import { settleBet as settleBetMath } from "@/lib/bet-math";
import { prisma } from "@/lib/prisma";
import { getEventResult, type ApiResult } from "@/lib/sports-api";

export type AutoSettleNoticeReason =
  | "POSTPONED"
  | "CANCELLED"
  | "NO_90_MINUTES"
  | "UNRESOLVABLE";

export type AutoSettleLegChange = {
  legId: string;
  eventName: string;
  from: LegStatus;
  to: LegStatus;
  scoreHome: number;
  scoreAway: number;
};

export type AutoSettleProposal = {
  betId: string;
  eventName: string;
  currency: string;
  legs: AutoSettleLegChange[];
  status: BetStatus;
  payout: number;
  profit: number;
};

export type AutoSettleNotice = {
  betId: string;
  eventName: string;
  reason: AutoSettleNoticeReason;
};

export type AutoSettleRun = {
  checked: number;
  applied: number;
  proposals: AutoSettleProposal[];
  notices: AutoSettleNotice[];
};

const NOTICE_LABEL: Record<AutoSettleNoticeReason, string> = {
  POSTPONED: "El evento fue pospuesto: decide manualmente (p. ej. VOID).",
  CANCELLED: "El evento fue cancelado: decide manualmente (p. ej. VOID).",
  NO_90_MINUTES:
    "El proveedor no distingue el marcador de 90 minutos: liquidación manual.",
  UNRESOLVABLE:
    "El mercado no es auto-liquidable con los datos actuales: liquidación manual.",
};

export function describeNotice(reason: AutoSettleNoticeReason): string {
  return NOTICE_LABEL[reason];
}

/** Ejecuta la sincronización de resultados pendientes para un usuario. */
export async function runAutoSettlement(
  userId: string,
  options: { apply: boolean },
): Promise<AutoSettleRun> {
  const bets = await prisma.bet.findMany({
    where: {
      userId,
      status: "PENDING",
      legs: {
        some: {
          status: "PENDING",
          externalEventId: { not: null },
          eventDate: { lte: new Date() },
        },
      },
    },
    include: {
      bankroll: { select: { currency: true } },
      legs: {
        orderBy: { position: "asc" },
        include: { selections: { orderBy: { position: "asc" } } },
      },
    },
  });

  const resultCache = new Map<string, ApiResult | null>();
  const loadResult = async (provider: string, externalId: string) => {
    const key = `${provider}:${externalId}`;
    if (resultCache.has(key)) return resultCache.get(key) ?? null;
    const result = await getEventResult(provider, externalId);
    resultCache.set(key, result);
    return result;
  };

  const proposals: AutoSettleProposal[] = [];
  const notices: AutoSettleNotice[] = [];
  let applied = 0;

  for (const bet of bets) {
    const changes: AutoSettleLegChange[] = [];
    const betNotices: AutoSettleNoticeReason[] = [];

    for (const leg of bet.legs) {
      if (leg.status !== "PENDING") continue;
      if (!leg.externalEventId) continue;

      const result = await loadResult(
        leg.externalProvider ?? "",
        leg.externalEventId,
      );

      if (!result) {
        betNotices.push("UNRESOLVABLE");
        continue;
      }

      if (result.status === "POSTPONED" || result.status === "CANCELLED") {
        betNotices.push(result.status);
        continue;
      }

      if (result.status !== "FINISHED") continue;

      if (
        !result.autoSettleable ||
        result.scoreHome === null ||
        result.scoreAway === null
      ) {
        betNotices.push("NO_90_MINUTES");
        continue;
      }

      const status = resolveLegStatus(
        {
          isBuilder: leg.isBuilder,
          selections: leg.selections.map((selection) => ({
            marketKey: selection.marketKey,
            pick: selection.pick,
            line: selection.line === null ? null : Number(selection.line),
          })),
        },
        { home: result.scoreHome, away: result.scoreAway },
      );

      if (!status) {
        betNotices.push("UNRESOLVABLE");
        continue;
      }

      changes.push({
        legId: leg.id,
        eventName: leg.eventName,
        from: leg.status,
        to: status,
        scoreHome: result.scoreHome,
        scoreAway: result.scoreAway,
      });
    }

    for (const reason of new Set(betNotices)) {
      notices.push({ betId: bet.id, eventName: bet.eventName, reason });
    }

    if (changes.length === 0) continue;

    const statusById = new Map(changes.map((change) => [change.legId, change.to]));
    const statuses = bet.legs.map(
      (leg) => statusById.get(leg.id) ?? leg.status,
    );

    const settlement = settleBetMath(
      bet.legs.map((leg, index) => ({
        odds: leg.odds,
        status: statuses[index]!,
      })),
      bet.stake,
      bet.isFreeBet,
    );

    const proposal: AutoSettleProposal = {
      betId: bet.id,
      eventName: bet.eventName,
      currency: bet.bankroll.currency,
      legs: changes,
      status: settlement.status,
      payout: settlement.payout.toNumber(),
      profit: settlement.profit.toNumber(),
    };

    if (options.apply) {
      await prisma.$transaction(async (tx) => {
        for (const change of changes) {
          await tx.betLeg.update({
            where: { id: change.legId },
            data: {
              status: change.to,
              autoSettled: true,
              scoreHome: change.scoreHome,
              scoreAway: change.scoreAway,
            },
          });
        }

        await tx.bet.update({
          where: { id: bet.id },
          data: {
            status: settlement.status,
            payout:
              settlement.status === "PENDING" ? null : settlement.payout,
            profit:
              settlement.status === "PENDING" ? null : settlement.profit,
            settledAt:
              settlement.status === "PENDING" ? null : new Date(),
          },
        });
      });
      applied += 1;
    } else {
      proposals.push(proposal);
    }
  }

  return { checked: bets.length, applied, proposals, notices };
}

/** Cron: aplica auto-liquidación solo a usuarios con modo AUTO. */
export async function runAutoSettlementForAllUsers(): Promise<{
  users: number;
  applied: number;
}> {
  const users = await prisma.user.findMany({
    where: {
      autoSettleMode: "AUTO" as AutoSettleMode,
      bets: {
        some: {
          status: "PENDING",
          legs: {
            some: {
              status: "PENDING",
              externalEventId: { not: null },
              eventDate: { lte: new Date() },
            },
          },
        },
      },
    },
    select: { id: true },
    take: 50,
  });

  let applied = 0;
  for (const user of users) {
    const run = await runAutoSettlement(user.id, { apply: true });
    applied += run.applied;
  }

  return { users: users.length, applied };
}

/** Modo de auto-liquidación del usuario. */
export async function getAutoSettleMode(
  userId: string,
): Promise<AutoSettleMode> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoSettleMode: true },
  });
  return user?.autoSettleMode ?? "SUGGEST";
}
