import type { SportOption } from "./sports";

export type ProviderKeys = {
  /** Código de competición en football-data.org. */
  footballData?: string;
  /** Nombre de liga en TheSportsDB (se resuelve a su id en runtime). */
  sportsDb?: string;
};

export type Competition = {
  /** Identificador estable dentro del catálogo. */
  value: string;
  /** Texto que se guarda en `BetLeg.competition` y se muestra al usuario. */
  label: string;
  /** Agrupación visual (país, continente o tipo). */
  region: string;
  providerKeys?: ProviderKeys;
};

function c(
  value: string,
  label: string,
  region: string,
  providerKeys?: ProviderKeys,
): Competition {
  return { value, label, region, ...(providerKeys ? { providerKeys } : {}) };
}

const FOOTBALL: Competition[] = [
  // Perú
  c("futbol-peru-liga-1", "Liga 1", "Perú", {
    sportsDb: "Peruvian Primera Division",
  }),
  // Sudamérica
  c("futbol-libertadores", "Copa Libertadores", "Sudamérica", {
    sportsDb: "Copa Libertadores",
  }),
  c("futbol-sudamericana", "Copa Sudamericana", "Sudamérica", {
    sportsDb: "Copa Sudamericana",
  }),
  c("futbol-brasil-serie-a", "Brasileirão Serie A", "Brasil", {
    footballData: "BSA",
    sportsDb: "Brazilian Serie A",
  }),
  c("futbol-argentina-lpf", "Liga Profesional", "Argentina", {
    sportsDb: "Argentinian Primera Division",
  }),
  c("futbol-colombia-primera-a", "Primera A", "Colombia", {
    sportsDb: "Colombian Primera A",
  }),
  c("futbol-chile-primera", "Primera División", "Chile", {
    sportsDb: "Chilean Primera Division",
  }),
  c("futbol-uruguay-primera", "Primera División", "Uruguay", {
    sportsDb: "Uruguayan Primera Division",
  }),
  c("futbol-ecuador-serie-a", "Liga Pro", "Ecuador", {
    sportsDb: "Ecuadorian Serie A",
  }),
  // Europa
  c("futbol-premier-league", "Premier League", "Europa", {
    footballData: "PL",
    sportsDb: "English Premier League",
  }),
  c("futbol-laliga", "LaLiga", "Europa", {
    footballData: "PD",
    sportsDb: "Spanish La Liga",
  }),
  c("futbol-serie-a", "Serie A", "Europa", {
    footballData: "SA",
    sportsDb: "Italian Serie A",
  }),
  c("futbol-bundesliga", "Bundesliga", "Europa", {
    footballData: "BL1",
    sportsDb: "German Bundesliga",
  }),
  c("futbol-ligue-1", "Ligue 1", "Europa", {
    footballData: "FL1",
    sportsDb: "French Ligue 1",
  }),
  c("futbol-eredivisie", "Eredivisie", "Europa", {
    footballData: "DED",
    sportsDb: "Dutch Eredivisie",
  }),
  c("futbol-primeira-liga", "Primeira Liga", "Europa", {
    footballData: "PPL",
    sportsDb: "Portuguese Primeira Liga",
  }),
  c("futbol-champions", "Champions League", "Europa", {
    footballData: "CL",
    sportsDb: "UEFA Champions League",
  }),
  c("futbol-europa-league", "Europa League", "Europa", {
    sportsDb: "UEFA Europa League",
  }),
  c("futbol-conference", "Conference League", "Europa", {
    sportsDb: "UEFA Europa Conference League",
  }),
  // Norteamérica
  c("futbol-mls", "MLS", "Norteamérica", {
    sportsDb: "American Major League Soccer",
  }),
  c("futbol-liga-mx", "Liga MX", "Norteamérica", {
    sportsDb: "Mexican Primera League",
  }),
  // Selecciones
  c("futbol-mundial", "Mundial", "Selecciones", {
    footballData: "WC",
    sportsDb: "FIFA World Cup",
  }),
  c("futbol-eliminatorias-conmebol", "Eliminatorias Conmebol", "Selecciones", {
    sportsDb: "CONMEBOL World Cup Qualifiers",
  }),
  c("futbol-copa-america", "Copa América", "Selecciones", {
    sportsDb: "Copa America",
  }),
  c("futbol-eurocopa", "Eurocopa", "Selecciones", {
    footballData: "EC",
    sportsDb: "UEFA European Championship",
  }),
  c("futbol-nations-league", "Nations League", "Selecciones", {
    sportsDb: "UEFA Nations League",
  }),
];

const TENNIS: Competition[] = [
  c("tenis-atp", "ATP Tour", "Circuito", { sportsDb: "ATP Tour" }),
  c("tenis-wta", "WTA Tour", "Circuito", { sportsDb: "WTA Tour" }),
  c("tenis-australian-open", "Australian Open", "Grand Slams", {
    sportsDb: "Australian Open",
  }),
  c("tenis-roland-garros", "Roland Garros", "Grand Slams", {
    sportsDb: "French Open",
  }),
  c("tenis-wimbledon", "Wimbledon", "Grand Slams", {
    sportsDb: "Wimbledon",
  }),
  c("tenis-us-open", "US Open", "Grand Slams", { sportsDb: "US Open" }),
];

const BASKETBALL: Competition[] = [
  c("baloncesto-nba", "NBA", "Norteamérica", { sportsDb: "NBA" }),
  c("baloncesto-euroleague", "EuroLeague", "Europa", {
    sportsDb: "EuroLeague",
  }),
  c("baloncesto-acb", "Liga ACB", "Europa", { sportsDb: "Spanish ACB" }),
  c("baloncesto-argentina", "Liga Nacional", "Sudamérica", {
    sportsDb: "Argentinian Liga A",
  }),
];

const BASEBALL: Competition[] = [
  c("beisbol-mlb", "MLB", "Norteamérica", { sportsDb: "MLB" }),
  c("beisbol-npb", "NPB", "Asia", { sportsDb: "Japanese Baseball League" }),
  c("beisbol-lmb", "Liga Mexicana", "México", {
    sportsDb: "Mexican Baseball League",
  }),
];

const AMERICAN_FOOTBALL: Competition[] = [
  c("nfl", "NFL", "Norteamérica", { sportsDb: "NFL" }),
  c("ncaa-football", "NCAA", "Norteamérica", {
    sportsDb: "NCAA Football",
  }),
];

const HOCKEY: Competition[] = [
  c("hockey-nhl", "NHL", "Norteamérica", { sportsDb: "NHL" }),
  c("hockey-khl", "KHL", "Europa", { sportsDb: "KHL" }),
  c("hockey-shl", "SHL", "Europa", { sportsDb: "Swedish Hockey League" }),
];

const VOLLEYBALL: Competition[] = [
  c("voleibol-vnl", "VNL", "Internacional", {
    sportsDb: "FIVB Volleyball Nations League",
  }),
  c("voleibol-superlega", "SuperLega", "Europa", {
    sportsDb: "Italian Volleyball League",
  }),
  c("voleibol-plusliga", "PlusLiga", "Europa", {
    sportsDb: "Polish PlusLiga",
  }),
];

const MMA: Competition[] = [
  c("mma-ufc", "UFC", "Internacional", { sportsDb: "UFC" }),
  c("mma-bellator", "Bellator", "Internacional", { sportsDb: "Bellator" }),
  c("mma-pfl", "PFL", "Internacional", { sportsDb: "PFL" }),
];

const BOXING: Competition[] = [
  c("boxeo-titulo-mundial", "Título Mundial", "Internacional"),
  c("boxeo-top-rank", "Top Rank", "Internacional", { sportsDb: "Top Rank" }),
];

const RUGBY: Competition[] = [
  c("rugby-six-nations", "Six Nations", "Europa", { sportsDb: "Six Nations" }),
  c("rugby-top-14", "Top 14", "Europa", { sportsDb: "French Top 14" }),
  c("rugby-championship", "Rugby Championship", "Internacional", {
    sportsDb: "The Rugby Championship",
  }),
  c("rugby-super-rugby", "Super Rugby", "Internacional", {
    sportsDb: "Super Rugby",
  }),
];

const F1: Competition[] = [
  c("f1-temporada", "Fórmula 1 · Temporada", "Internacional", {
    sportsDb: "Formula 1",
  }),
];

const ESPORTS: Competition[] = [
  c("esports-cs2", "Counter-Strike 2", "Internacional", {
    sportsDb: "Counter-Strike",
  }),
  c("esports-lol", "League of Legends", "Internacional", {
    sportsDb: "League of Legends",
  }),
  c("esports-dota2", "Dota 2", "Internacional", { sportsDb: "Dota 2" }),
  c("esports-valorant", "Valorant", "Internacional", {
    sportsDb: "Valorant",
  }),
];

const CYCLING: Competition[] = [
  c("ciclismo-tour-francia", "Tour de Francia", "Grandes vueltas", {
    sportsDb: "Tour de France",
  }),
  c("ciclismo-giro", "Giro de Italia", "Grandes vueltas", {
    sportsDb: "Giro d'Italia",
  }),
  c("ciclismo-vuelta", "Vuelta a España", "Grandes vueltas", {
    sportsDb: "Vuelta a España",
  }),
];

const GOLF: Competition[] = [
  c("golf-pga", "PGA Tour", "Circuitos", { sportsDb: "PGA Tour" }),
  c("golf-european", "European Tour", "Circuitos", {
    sportsDb: "European Tour",
  }),
  c("golf-lpga", "LPGA Tour", "Circuitos", { sportsDb: "LPGA Tour" }),
];

const CRICKET: Competition[] = [
  c("cricket-ipl", "IPL", "Ligas", { sportsDb: "Indian Premier League" }),
  c("cricket-big-bash", "Big Bash", "Ligas", {
    sportsDb: "Big Bash League",
  }),
  c("cricket-ashes", "The Ashes", "Internacional", {
    sportsDb: "The Ashes",
  }),
];

const TABLE_TENNIS: Competition[] = [
  c("tenis-mesa-wtt", "World Table Tennis", "Internacional", {
    sportsDb: "World Table Tennis",
  }),
  c("tenis-mesa-elite", "TT Elite Series", "Internacional", {
    sportsDb: "TT Elite Series",
  }),
];

const HANDBALL: Competition[] = [
  c("balonmano-ehf", "EHF Champions League", "Europa", {
    sportsDb: "EHF Champions League",
  }),
  c("balonmano-asobal", "Liga ASOBAL", "Europa", {
    sportsDb: "Liga ASOBAL",
  }),
];

const DARTS: Competition[] = [
  c("dardos-pdc", "PDC World Championship", "Internacional", {
    sportsDb: "PDC World Championship",
  }),
  c("dardos-premier", "Premier League Darts", "Reino Unido", {
    sportsDb: "Premier League Darts",
  }),
];

export const COMPETITIONS_BY_SPORT: Record<SportOption, Competition[]> = {
  Fútbol: FOOTBALL,
  Tenis: TENNIS,
  Baloncesto: BASKETBALL,
  Béisbol: BASEBALL,
  "Fútbol americano": AMERICAN_FOOTBALL,
  Hockey: HOCKEY,
  Voleibol: VOLLEYBALL,
  "MMA/UFC": MMA,
  Boxeo: BOXING,
  Rugby: RUGBY,
  "Fórmula 1": F1,
  Ciclismo: CYCLING,
  Golf: GOLF,
  Cricket: CRICKET,
  "Tenis de mesa": TABLE_TENNIS,
  Balonmano: HANDBALL,
  Dardos: DARTS,
  eSports: ESPORTS,
  Otros: [],
};

export type CompetitionGroup = {
  region: string;
  items: Competition[];
};

export function getCompetitionsForSport(sport: string): Competition[] {
  return COMPETITIONS_BY_SPORT[sport as SportOption] ?? [];
}

/** Agrupa por región preservando el orden de aparición. */
export function groupCompetitionsByRegion(
  competitions: Competition[],
): CompetitionGroup[] {
  const groups = new Map<string, Competition[]>();
  for (const competition of competitions) {
    const list = groups.get(competition.region) ?? [];
    list.push(competition);
    groups.set(competition.region, list);
  }
  return [...groups.entries()].map(([region, items]) => ({ region, items }));
}

/** Busca por `value` o por `label` (para datos legacy o copiados). */
export function findCompetition(
  sport: string,
  valueOrLabel: string,
): Competition | undefined {
  const normalized = valueOrLabel.trim().toLowerCase();
  if (!normalized) return undefined;
  return getCompetitionsForSport(sport).find(
    (competition) =>
      competition.value.toLowerCase() === normalized ||
      competition.label.toLowerCase() === normalized,
  );
}

export function getCompetitionLabel(
  sport: string,
  valueOrLabel: string,
): string {
  return findCompetition(sport, valueOrLabel)?.label ?? valueOrLabel;
}

export function getCompetitionProviderKeys(
  sport: string,
  valueOrLabel: string,
): ProviderKeys | undefined {
  return findCompetition(sport, valueOrLabel)?.providerKeys;
}
