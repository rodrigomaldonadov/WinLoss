import "server-only";

import type { ParlayEvent } from "@/lib/parlay/analysis";

const BASE_URL = "https://parlay-api.com";

/** Casas que la API reconoce para game lines (Pinnacle no está en el catálogo). */
export const PARLAY_BOOKMAKERS = [
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "betrivers",
  "bet365",
  "bovada",
  "hardrock",
  "fanatics",
  "unibet",
  "pmu",
  "novig",
  "prophetx",
].join(",");

async function parlayGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T | null> {
  const apiKey = process.env.PARLAY_API_KEY?.trim();
  if (!apiKey) return null;

  const url = new URL(`${BASE_URL}${path}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  url.searchParams.set("apiKey", apiKey);

  try {
    const response = await fetch(url, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.error(
        `[parlay] ${path} ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("[parlay] fetch:", error);
    return null;
  }
}

/** Partidos con 1X2 y totales. La clave va solo en el servidor. */
export async function getParlayGames(
  sportKey: string,
): Promise<ParlayEvent[] | null> {
  return parlayGet<ParlayEvent[]>(`/v1/sports/${sportKey}/odds`, {
    markets: "h2h,totals",
    bookmakers: PARLAY_BOOKMAKERS,
    regions: "us,eu,uk",
  });
}

/** Props de jugador para un partido/mercado (se piden solo si hacen falta). */
export async function getParlayProps(
  sportKey: string,
  marketKey: string,
): Promise<ParlayEvent[] | null> {
  return parlayGet<ParlayEvent[]>(`/v1/sports/${sportKey}/odds`, {
    markets: marketKey,
    bookmakers: PARLAY_BOOKMAKERS,
    regions: "us",
  });
}

/** Intenta mercados de predicción; normalmente no cotizan moneyline de partido. */
export async function getParlayPredictionMarkets(
  sportKey: string,
): Promise<ParlayEvent[] | null> {
  return parlayGet<ParlayEvent[]>(`/v1/sports/${sportKey}/odds`, {
    markets: "h2h",
    bookmakers: "polymarket,kalshi",
    regions: "us",
  });
}

/** Archivo histórico (plan gratuito: 48 h). */
export async function getParlayHistorical(
  sportKey: string,
  date: string,
): Promise<ParlayEvent[] | null> {
  return parlayGet<ParlayEvent[]>(
    `/v1/historical/sports/${sportKey}/odds`,
    {
      markets: "h2h",
      bookmakers: "novig",
      date,
    },
  );
}
