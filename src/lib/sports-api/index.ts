import "server-only";

import { fakeProvider } from "./fake";
import { footballDataProvider } from "./football-data";
import { sportsDbProvider } from "./thesportsdb";
import type {
  ApiEvent,
  ApiResult,
  SearchEventsInput,
  SportsDataProvider,
} from "./types";

export type { ApiEvent, ApiResult, SearchEventsInput };

const PROVIDERS: Record<string, SportsDataProvider> = {
  fake: fakeProvider,
  "football-data": footballDataProvider,
  thesportsdb: sportsDbProvider,
};

/** Proveedor por nombre (auto-liquidación de legs ya vinculados). */
export function getProviderByName(
  name: string | null | undefined,
): SportsDataProvider | null {
  if (!name) return null;
  return PROVIDERS[name] ?? null;
}

/** Proveedores disponibles para búsqueda, en orden de preferencia. */
export function getSearchProviders(): SportsDataProvider[] {
  const configured = (process.env.SPORTS_API_PROVIDER ?? "auto").toLowerCase();
  if (configured === "fake") return [fakeProvider];
  if (configured === "football-data") return [footballDataProvider];
  if (configured === "thesportsdb") return [sportsDbProvider];

  const providers: SportsDataProvider[] = [];
  if (process.env.FOOTBALL_DATA_API_KEY) providers.push(footballDataProvider);
  // TheSportsDB tiene clave de test pública ("123") y cubre Liga 1/Libertadores.
  providers.push(sportsDbProvider);
  return providers;
}

/**
 * Busca en todos los proveedores disponibles y deduplica.
 * Si uno falla, se ignoran sus errores (modo manual).
 */
export async function searchEvents(
  input: SearchEventsInput,
): Promise<ApiEvent[]> {
  const providers = getSearchProviders();
  const settled = await Promise.allSettled(
    providers.map((provider) => provider.searchEvents(input)),
  );

  const byKey = new Map<string, ApiEvent>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const event of result.value) {
      const key = `${event.home}|${event.away}|${event.kickoffUtc.slice(0, 10)}`;
      // El primero (football-data) tiene prioridad sobre el segundo.
      if (!byKey.has(key)) byKey.set(key, event);
    }
  }

  return [...byKey.values()].sort(
    (a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc),
  );
}

export async function getEventResult(
  provider: string | null | undefined,
  externalEventId: string | null | undefined,
): Promise<ApiResult | null> {
  const adapter = getProviderByName(provider);
  if (!adapter || !externalEventId) return null;
  try {
    return await adapter.getEventResult(externalEventId);
  } catch (error) {
    console.error(`[sports-api] ${provider} getEventResult:`, error);
    return null;
  }
}
