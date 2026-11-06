import "server-only";

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Resultados finales no cambian: se cachean de por vida (proceso). */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;
  const value = await loader();
  setCached(key, value, ttlMs);
  return value;
}

export const SEARCH_TTL_MS = 10 * 60 * 1000;
export const FINAL_RESULT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
