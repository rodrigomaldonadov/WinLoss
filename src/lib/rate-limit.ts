/**
 * Limitador en memoria por proceso. No sustituye a un WAF ni a Redis: sirve
 * como freno básico contra ráfagas (login, acciones que gastan API externa).
 * En un despliegue con varias instancias cada una lleva su propia cuenta.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function cleanup(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function rateLimit({
  key,
  limit,
  windowMs,
  now = Date.now(),
}: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  cleanup(now);

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  current.count += 1;
  if (current.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, current.resetAt - now),
    };
  }

  return {
    ok: true,
    remaining: Math.max(0, limit - current.count),
    retryAfterMs: 0,
  };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
