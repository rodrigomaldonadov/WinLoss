import { auth } from "@/auth";
import { parseHistoryFilters } from "@/lib/analysis/history";
import { csvResponse, toCsvRow } from "@/lib/csv";
import {
  getAnalysisHistoryExport,
  type AnalysisHistoryItem,
} from "@/lib/data/analysis-history";
import { getUserPreferences } from "@/lib/data/user";

const HEADERS = [
  "fecha",
  "competicion",
  "local",
  "visitante",
  "goles_local",
  "goles_visitante",
  "resultado",
  "provisional",
  "modo",
  "confianza",
  "prob_local",
  "prob_empate",
  "prob_visitante",
  "pick",
  "acierto",
  "con_apuesta",
];

function outcomeLabel(outcome: AnalysisHistoryItem["outcome"]): string {
  if (outcome === "DRAW") return "Empate";
  if (outcome === "AWAY") return "Visitante";
  return "Local";
}

function pickOf(item: AnalysisHistoryItem): "HOME" | "DRAW" | "AWAY" | "" {
  if (!item.prediction) return "";
  const entries: ["HOME" | "DRAW" | "AWAY", number][] = [
    ["HOME", item.prediction.home],
    ["DRAW", item.prediction.draw],
    ["AWAY", item.prediction.away],
  ];
  return entries.sort((left, right) => right[1] - left[1])[0]?.[0] ?? "";
}

function percent(value: number): string {
  return (value * 100).toFixed(1);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("No autorizado", { status: 401 });
  }

  const url = new URL(request.url);
  const params: Record<string, string | string[]> = {};
  for (const key of ["q", "desde", "hasta", "modo", "mios", "competicion"]) {
    const values = url.searchParams.getAll(key);
    if (values.length === 1) params[key] = values[0];
    if (values.length > 1) params[key] = values;
  }

  const filters = parseHistoryFilters(params);
  const preferences = await getUserPreferences(session.user.id);
  const timeZone = preferences.timezone;

  const items = await getAnalysisHistoryExport({
    userId: session.user.id,
    filters,
    timeZone,
  });

  const rows = [HEADERS.join(",")];
  for (const item of items) {
    const pick = pickOf(item);
    rows.push(
      toCsvRow([
        item.playedAt.toISOString(),
        item.competition,
        item.homeName,
        item.awayName,
        item.homeGoals,
        item.awayGoals,
        outcomeLabel(item.outcome),
        item.provisional ? "sí" : "no",
        item.mode === "saved" ? "Guardada" : "Reconstruida",
        item.confidence ?? "",
        item.prediction ? percent(item.prediction.home) : "",
        item.prediction ? percent(item.prediction.draw) : "",
        item.prediction ? percent(item.prediction.away) : "",
        pick ? outcomeLabel(pick) : "",
        pick ? (pick === item.outcome ? "sí" : "no") : "",
        item.hasBet ? "sí" : "no",
      ]),
    );
  }

  return csvResponse(
    rows,
    `winloss-historial-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}
