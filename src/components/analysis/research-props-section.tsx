import { ResearchProps } from "@/components/analysis/research-props";
import { propLines, type ParlayEvent, type ParlayPropMarket } from "@/lib/parlay/analysis";
import { getParlayProps } from "@/lib/parlay/client";

/**
 * Carga las props del mercado inicial en el servidor. Los cambios de mercado
 * posteriores los resuelve el panel en cliente con su propio esqueleto, para
 * no recargar la página ni perder la posición del scroll.
 */
export async function ResearchPropsSection({
  event,
  sportKey,
  market,
}: {
  event: ParlayEvent;
  sportKey: string;
  market: ParlayPropMarket | null;
}) {
  if (!market) {
    return (
      <ResearchProps
        eventId={event.id}
        homeTeam={event.home_team}
        awayTeam={event.away_team}
        sportKey={sportKey}
        initialMarket={null}
        initialLines={[]}
      />
    );
  }

  const props = await getParlayProps(sportKey, market);
  const propEvent = props?.find((item) => item.id === event.id) ?? null;
  const lines = propEvent
    ? propLines(propEvent, market).filter(
        (line) =>
          line.player !== event.home_team && line.player !== event.away_team,
      )
    : [];

  return (
    <ResearchProps
      eventId={event.id}
      homeTeam={event.home_team}
      awayTeam={event.away_team}
      sportKey={sportKey}
      initialMarket={market}
      initialLines={lines}
    />
  );
}
