import "server-only";

const nextAllowedAt = new Map<string, number>();

/**
 * Serializa llamadas por proveedor respetando un intervalo mínimo.
 * Ej.: football-data free = 10 req/min → 6,5 s entre llamadas.
 */
export async function throttle(
  key: string,
  minIntervalMs: number,
): Promise<void> {
  const configured = Number(process.env.SPORTS_API_THROTTLE_MS);
  const interval = Number.isFinite(configured) ? configured : minIntervalMs;
  const now = Date.now();
  const allowedAt = nextAllowedAt.get(key) ?? 0;
  const wait = Math.max(0, allowedAt - now);
  nextAllowedAt.set(key, Math.max(now, allowedAt) + interval);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}
