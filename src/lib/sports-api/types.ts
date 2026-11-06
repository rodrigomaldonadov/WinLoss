export type ApiEventStatus =
  | "SCHEDULED"
  | "LIVE"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED";

export type ApiEvent = {
  provider: string;
  externalId: string;
  sport: string;
  competition: string;
  home: string;
  away: string;
  /** ISO 8601 en UTC. */
  kickoffUtc: string;
  status: ApiEventStatus;
  scoreHome?: number | null;
  scoreAway?: number | null;
  /** false cuando el proveedor no garantiza marcador de 90 minutos. */
  autoSettleable?: boolean;
};

export type ApiResult = {
  status: ApiEventStatus;
  scoreHome: number | null;
  scoreAway: number | null;
  autoSettleable: boolean;
};

export type SearchEventsInput = {
  sport: string;
  /** Etiqueta o value de competición del catálogo. */
  competition?: string;
  /** YYYY-MM-DD (zona del usuario, solo para delimitar la búsqueda). */
  from: string;
  /** YYYY-MM-DD */
  to: string;
};

export interface SportsDataProvider {
  readonly name: string;
  searchEvents(input: SearchEventsInput): Promise<ApiEvent[]>;
  getEventResult(externalEventId: string): Promise<ApiResult | null>;
}
