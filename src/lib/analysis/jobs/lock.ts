import type { PrismaClient } from "@prisma/client";

export type JobLock = {
  acquire(): Promise<boolean>;
  release(): Promise<void>;
};

/** Lock en memoria para tests y ejecuciones de un solo proceso. */
export function createInMemoryLock(): JobLock {
  let held = false;
  return {
    async acquire() {
      if (held) return false;
      held = true;
      return true;
    },
    async release() {
      held = false;
    },
  };
}

function isUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Lock persistente para que dos invocaciones del cron no se solapen entre
 * procesos o réplicas. Si el proceso muere, `expiresAt` libera el lock.
 */
export function createPrismaLock(
  prisma: PrismaClient,
  key: string,
  ttlMs: number,
): JobLock {
  return {
    async acquire() {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);

      try {
        await prisma.analysisRefreshLock.create({
          data: { key, lockedAt: now, expiresAt },
        });
        return true;
      } catch (error) {
        if (!isUniqueError(error)) throw error;
      }

      // Solo se puede tomar un lock caducado; el deleteMany es atómico y si
      // otra instancia se adelantó, el create vuelve a fallar con P2002.
      const removed = await prisma.analysisRefreshLock.deleteMany({
        where: { key, expiresAt: { lt: now } },
      });
      if (removed.count === 0) return false;

      try {
        await prisma.analysisRefreshLock.create({
          data: { key, lockedAt: now, expiresAt },
        });
        return true;
      } catch (error) {
        if (isUniqueError(error)) return false;
        throw error;
      }
    },

    async release() {
      await prisma.analysisRefreshLock.deleteMany({ where: { key } });
    },
  };
}
