import "server-only";

import { prisma } from "@/lib/prisma";

export type BookmakerSummary = {
  id: string;
  name: string;
  isActive: boolean;
  betCount: number;
};

export async function getBookmakersForUser(
  userId: string,
): Promise<BookmakerSummary[]> {
  const bookmakers = await prisma.bookmaker.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { bets: true } } },
  });

  return bookmakers.map((bookmaker) => ({
    id: bookmaker.id,
    name: bookmaker.name,
    isActive: bookmaker.isActive,
    betCount: bookmaker._count.bets,
  }));
}

export async function getBookmakerOptions(userId: string) {
  return prisma.bookmaker.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
