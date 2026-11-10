import type { ParlayEvent } from "./analysis";

const SPORT_LABELS: Record<string, string> = {
  basketball: "Baloncesto",
  baseball: "Béisbol",
  americanfootball: "Fútbol americano",
  icehockey: "Hockey",
  soccer: "Fútbol",
  mma: "MMA/UFC",
  tennis: "Tenis",
  boxing: "Boxeo",
  golf: "Golf",
  cricket: "Cricket",
  rugby: "Rugby",
};

export function parlaySportLabel(sportKey: string): string {
  const prefix = sportKey.split("_")[0] ?? "";
  return SPORT_LABELS[prefix] ?? "Otros";
}

/** Enlace a /bets/new con el partido y la cuota ya precargados. */
export function researchBetHref({
  event,
  sportKey,
  market,
  selection,
  odds,
  line,
  pick,
  subject,
}: {
  event: ParlayEvent;
  sportKey: string;
  market: string;
  selection: string;
  odds?: number | null;
  line?: number | null;
  pick?: string | null;
  subject?: string | null;
}): string {
  const params = new URLSearchParams({
    evento: `${event.home_team} vs ${event.away_team}`,
    competicion: event.sport_title ?? "",
    fecha: event.commence_time.slice(0, 10),
    deporte: parlaySportLabel(sportKey),
    origen: "ParlayAPI",
    mercado: market,
    seleccion: selection,
  });

  if (odds && Number.isFinite(odds)) params.set("cuota", odds.toFixed(2));
  if (line !== null && line !== undefined) params.set("linea", String(line));
  if (pick) params.set("pick", pick);
  if (subject) params.set("subject", subject);

  return `/bets/new?${params.toString()}`;
}
