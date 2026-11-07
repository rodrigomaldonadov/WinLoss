import type { BetFormDefaults } from "@/components/bets/bet-form";

export type AnalysisPrefillInput = {
  evento?: string | null;
  competicion?: string | null;
  fecha?: string | null;
  deporte?: string | null;
};

/**
 * Convierte los parámetros de /bets/new en valores iniciales del formulario.
 * Solo precarga el evento: la cuota, el mercado y la selección los define el
 * usuario. No se inventan datos de análisis.
 */
export function buildAnalysisPrefill(
  input: AnalysisPrefillInput,
): BetFormDefaults | null {
  const eventName = input.evento?.trim();
  if (!eventName) return null;

  const sport = input.deporte?.trim() || "Fútbol";
  const competition = input.competicion?.trim() || null;
  const eventDate =
    input.fecha && /^\d{4}-\d{2}-\d{2}/.test(input.fecha)
      ? input.fecha.slice(0, 10)
      : null;

  return {
    sport,
    competition,
    eventName,
    legs: [
      {
        sport,
        competition,
        eventName,
        eventDate,
        isBuilder: false,
        selections: [
          {
            market: "",
            selection: "",
            marketKey: "CUSTOM",
            line: null,
            pick: null,
            subject: null,
          },
        ],
      },
    ],
  };
}
