import type { LegMarketKey, LegStatus } from "@prisma/client";

export type ConsensusSelectionInput = {
  market: string;
  selection: string;
  marketKey: LegMarketKey;
  line: number | null;
  pick: string | null;
  subject: string | null;
};

export type ConsensusLegInput = {
  eventName: string;
  eventDate: Date | null;
  sport: string;
  competition: string | null;
  odds: number;
  isBuilder: boolean;
  userId: string;
  selections: ConsensusSelectionInput[];
};

export type ConsensusHistoryLegInput = {
  odds: number;
  isBuilder: boolean;
  status: LegStatus;
  selections: ConsensusSelectionInput[];
};

export type ConsensusOption = {
  key: string;
  label: string;
  count: number;
  /** 0–1 dentro del mercado (reparto de picks). */
  share: number;
  averageOdds: number | null;
  /** Probabilidad implícita de la cuota media, normalizada en el mercado. */
  marketProbability: number | null;
  /** Aciertos históricos (las medias cuentan 0.5). */
  historyWins: number;
  historySettled: number;
  historyRate: number | null;
  /** Probabilidad final estimada; null si el mercado tiene una sola opción. */
  probability: number | null;
};

export type ConsensusMarket = {
  key: string;
  label: string;
  total: number;
  options: ConsensusOption[];
  leader: ConsensusOption;
  /** false cuando solo hay una opción y no se puede repartir probabilidad. */
  hasDistribution: boolean;
};

export type HistoryStat = {
  key: string;
  marketLabel: string;
  optionLabel: string;
  wins: number;
  settled: number;
  rate: number;
  averageOdds: number | null;
};

export type ConsensusMatch = {
  key: string;
  eventName: string;
  homeTeam: string | null;
  awayTeam: string | null;
  sport: string;
  competition: string | null;
  eventDate: Date;
  picks: number;
  users: number;
  averageOdds: number | null;
  markets: ConsensusMarket[];
  primary: ConsensusMarket;
};

export type ConsensusResult = {
  matches: ConsensusMatch[];
  totalPicks: number;
  totalUsers: number;
  history: HistoryStat[];
};

type SelectionDescriptor = {
  marketKey: string;
  marketLabel: string;
  optionKey: string;
  optionLabel: string;
};

type OptionAccumulator = {
  label: string;
  count: number;
  oddsSum: number;
  oddsCount: number;
};

type HistoryAccumulator = {
  marketLabel: string;
  optionLabel: string;
  wins: number;
  settled: number;
  oddsSum: number;
  oddsCount: number;
};

type MarketAccumulator = {
  key: string;
  label: string;
  total: number;
  options: Map<string, OptionAccumulator>;
};

type MatchAccumulator = {
  key: string;
  eventName: string;
  homeTeam: string | null;
  awayTeam: string | null;
  sport: string;
  competition: string | null;
  eventDate: Date;
  picks: number;
  userIds: Set<string>;
  oddsSum: number;
  oddsCount: number;
  markets: Map<string, MarketAccumulator>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const LINE_MARKET_KEYS = new Set<LegMarketKey>([
  "TOTAL_GOALS",
  "TEAM_TOTAL_GOALS",
  "TOTAL_CORNERS",
  "TOTAL_CARDS",
  "GENERIC_LINE",
  "ASIAN_HANDICAP",
  "EXACT_TOTAL_GOALS",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bvs\.?\b/g, "vs")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitEvent(eventName: string): { home: string | null; away: string | null } {
  const match = /^(.+?)\s+vs\.?\s+(.+)$/i.exec(eventName.trim());
  if (!match?.[1] || !match[2]) return { home: null, away: null };
  return {
    home: match[1].trim().replace(/[.,;]+$/, ""),
    away: match[2].trim().replace(/[.,;]+$/, ""),
  };
}

function formatLine(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function teamLabel(
  side: "HOME" | "AWAY",
  home: string | null,
  away: string | null,
): string {
  if (side === "HOME") return home ?? "Local";
  return away ?? "Visitante";
}

function describeSelection(
  selection: ConsensusSelectionInput,
  home: string | null,
  away: string | null,
): SelectionDescriptor | null {
  const { marketKey, pick, line, subject, market, selection: label } = selection;

  if (marketKey === "CUSTOM") {
    const marketLabel = market.trim() || "Otro mercado";
    const optionLabel = label.trim();
    if (!optionLabel) return null;
    return {
      marketKey: `CUSTOM:${normalize(marketLabel)}`,
      marketLabel,
      optionKey: normalize(optionLabel),
      optionLabel,
    };
  }

  if (!pick) return null;

  switch (marketKey) {
    case "MATCH_RESULT": {
      if (pick !== "HOME" && pick !== "DRAW" && pick !== "AWAY") return null;
      return {
        marketKey: "MATCH_RESULT",
        marketLabel: "Resultado final",
        optionKey: pick,
        optionLabel:
          pick === "DRAW"
            ? "Empate"
            : teamLabel(pick, home, away),
      };
    }

    case "DOUBLE_CHANCE": {
      if (
        pick !== "HOME_DRAW" &&
        pick !== "HOME_AWAY" &&
        pick !== "DRAW_AWAY"
      ) {
        return null;
      }
      const homeLabel = teamLabel("HOME", home, away);
      const awayLabel = teamLabel("AWAY", home, away);
      return {
        marketKey: "DOUBLE_CHANCE",
        marketLabel: "Doble oportunidad",
        optionKey: pick,
        optionLabel:
          pick === "HOME_DRAW"
            ? `${homeLabel} o Empate`
            : pick === "HOME_AWAY"
              ? `${homeLabel} o ${awayLabel}`
              : `Empate o ${awayLabel}`,
      };
    }

    case "DRAW_NO_BET": {
      if (pick !== "HOME" && pick !== "AWAY") return null;
      return {
        marketKey: "DRAW_NO_BET",
        marketLabel: "Empate no válido",
        optionKey: pick,
        optionLabel: teamLabel(pick, home, away),
      };
    }

    case "BTTS": {
      if (pick !== "YES" && pick !== "NO") return null;
      return {
        marketKey: "BTTS",
        marketLabel: "Ambos equipos marcan",
        optionKey: pick,
        optionLabel: pick === "YES" ? "Sí" : "No",
      };
    }

    case "TOTAL_GOALS": {
      if (pick !== "OVER" && pick !== "UNDER") return null;
      const lineLabel = line === null ? "" : formatLine(line);
      return {
        marketKey: `TOTAL_GOALS:${lineLabel}`,
        marketLabel: line === null ? "Total de goles" : `Total de goles ${lineLabel}`,
        optionKey: pick,
        optionLabel: `${pick === "OVER" ? "Más" : "Menos"} de ${lineLabel}`.trim(),
      };
    }

    case "TEAM_TOTAL_GOALS": {
      const [prefixedTeam, prefixedSide] = pick.split("_");
      const team = subject ?? prefixedTeam;
      const side = subject ? pick : prefixedSide;
      if (
        (team !== "HOME" && team !== "AWAY") ||
        (side !== "OVER" && side !== "UNDER")
      ) {
        return null;
      }
      const lineLabel = line === null ? "" : formatLine(line);
      return {
        marketKey: `TEAM_TOTAL_GOALS:${team}:${lineLabel}`,
        marketLabel: `Goles de ${teamLabel(team, home, away)}${lineLabel ? ` ${lineLabel}` : ""}`,
        optionKey: side,
        optionLabel: side === "OVER" ? "Más" : "Menos",
      };
    }

    case "TOTAL_CORNERS":
    case "TOTAL_CARDS":
    case "GENERIC_LINE": {
      if (pick !== "OVER" && pick !== "UNDER") return null;
      const lineLabel = line === null ? "" : formatLine(line);
      const base =
        marketKey === "TOTAL_CORNERS"
          ? "Córneres"
          : marketKey === "TOTAL_CARDS"
            ? "Tarjetas"
            : market.trim() || "Mercado con línea";
      return {
        marketKey: `${marketKey}:${normalize(base)}:${lineLabel}`,
        marketLabel: lineLabel ? `${base} ${lineLabel}` : base,
        optionKey: pick,
        optionLabel: `${pick === "OVER" ? "Más" : "Menos"} de ${lineLabel}`.trim(),
      };
    }

    case "ASIAN_HANDICAP": {
      if (pick !== "HOME" && pick !== "AWAY") return null;
      const lineLabel = line === null ? "" : formatLine(line);
      return {
        marketKey: `ASIAN_HANDICAP:${lineLabel}`,
        marketLabel: `Hándicap ${lineLabel}`.trim(),
        optionKey: pick,
        optionLabel: teamLabel(pick, home, away),
      };
    }

    case "ODD_EVEN": {
      if (pick !== "ODD" && pick !== "EVEN") return null;
      return {
        marketKey: "ODD_EVEN",
        marketLabel: "Total par o impar",
        optionKey: pick,
        optionLabel: pick === "ODD" ? "Impar" : "Par",
      };
    }

    case "WIN_TO_NIL": {
      if (pick !== "HOME" && pick !== "AWAY") return null;
      return {
        marketKey: "WIN_TO_NIL",
        marketLabel: "Gana sin recibir gol",
        optionKey: pick,
        optionLabel: teamLabel(pick, home, away),
      };
    }

    case "EXACT_TOTAL_GOALS": {
      if (line === null) return null;
      return {
        marketKey: "EXACT_TOTAL_GOALS",
        marketLabel: "Total exacto de goles",
        optionKey: String(line),
        optionLabel: `${formatLine(line)} goles`,
      };
    }

    default:
      return null;
  }
}

function roundOdds(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundProbability(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Histórico por tipo de selección (no por equipo): agrupa “Local” de 1X2,
 * “Más de 2.5”, “Sí” de BTTS, etc. Los builders se omiten porque su resultado
 * es combinado y no se puede atribuir a cada selección.
 */
function buildHistoryStats(
  legs: ConsensusHistoryLegInput[],
): Map<string, HistoryAccumulator> {
  const stats = new Map<string, HistoryAccumulator>();

  for (const leg of legs) {
    if (leg.isBuilder) continue;
    if (
      leg.status !== "WON" &&
      leg.status !== "LOST" &&
      leg.status !== "HALF_WON" &&
      leg.status !== "HALF_LOST"
    ) {
      continue;
    }

    const wins =
      leg.status === "WON" ? 1 : leg.status === "HALF_WON" ? 0.5 : 0;

    for (const selection of leg.selections) {
      // Un mercado con línea sin valor no se puede comparar con los partidos
      // próximos; se excluye del histórico.
      if (LINE_MARKET_KEYS.has(selection.marketKey) && selection.line === null) {
        continue;
      }

      const descriptor = describeSelection(selection, null, null);
      if (!descriptor) continue;

      const key = `${descriptor.marketKey}|${descriptor.optionKey}`;
      const stat = stats.get(key) ?? {
        marketLabel: descriptor.marketLabel,
        optionLabel: descriptor.optionLabel,
        wins: 0,
        settled: 0,
        oddsSum: 0,
        oddsCount: 0,
      };

      stat.wins += wins;
      stat.settled += 1;
      if (Number.isFinite(leg.odds) && leg.odds > 1) {
        stat.oddsSum += leg.odds;
        stat.oddsCount += 1;
      }
      stats.set(key, stat);
    }
  }

  return stats;
}

/**
 * Agrupa los picks de partidos próximos por evento y mercado.
 *
 * Los datos son agregados: la salida nunca incluye identificadores de usuario,
 * solo el número de usuarios distintos que respaldan cada partido.
 */
export function aggregateConsensus(
  legs: ConsensusLegInput[],
  options: {
    now?: Date;
    days?: number;
    /** Resultados de apuestas pasadas para ajustar las probabilidades. */
    history?: ConsensusHistoryLegInput[];
  } = {},
): ConsensusResult {
  const now = options.now ?? new Date();
  const cutoff = options.days
    ? new Date(now.getTime() + options.days * DAY_MS)
    : null;
  const matches = new Map<string, MatchAccumulator>();
  const allUsers = new Set<string>();
  const historyStats = buildHistoryStats(options.history ?? []);
  let totalPicks = 0;

  for (const leg of legs) {
    if (!leg.eventDate) continue;
    if (leg.eventDate.getTime() < now.getTime()) continue;
    if (cutoff && leg.eventDate.getTime() > cutoff.getTime()) continue;

    const eventKey = normalize(leg.eventName);
    if (!eventKey) continue;

    const { home, away } = splitEvent(leg.eventName);
    let match = matches.get(eventKey);

    if (!match) {
      match = {
        key: eventKey,
        eventName: leg.eventName,
        homeTeam: home,
        awayTeam: away,
        sport: leg.sport,
        competition: leg.competition,
        eventDate: leg.eventDate,
        picks: 0,
        userIds: new Set(),
        oddsSum: 0,
        oddsCount: 0,
        markets: new Map(),
      };
      matches.set(eventKey, match);
    }

    match.userIds.add(leg.userId);
    allUsers.add(leg.userId);
    if (leg.eventDate.getTime() < match.eventDate.getTime()) {
      match.eventDate = leg.eventDate;
    }
    if (!match.competition && leg.competition) {
      match.competition = leg.competition;
    }

    for (const selection of leg.selections) {
      const descriptor = describeSelection(selection, home, away);
      if (!descriptor) continue;

      match.picks += 1;
      totalPicks += 1;

      let market = match.markets.get(descriptor.marketKey);
      if (!market) {
        market = {
          key: descriptor.marketKey,
          label: descriptor.marketLabel,
          total: 0,
          options: new Map(),
        };
        match.markets.set(descriptor.marketKey, market);
      }

      market.total += 1;
      const option = market.options.get(descriptor.optionKey) ?? {
        label: descriptor.optionLabel,
        count: 0,
        oddsSum: 0,
        oddsCount: 0,
      };
      option.count += 1;

      if (!leg.isBuilder && Number.isFinite(leg.odds) && leg.odds > 0) {
        option.oddsSum += leg.odds;
        option.oddsCount += 1;
        match.oddsSum += leg.odds;
        match.oddsCount += 1;
      }

      market.options.set(descriptor.optionKey, option);
    }
  }

  const result: ConsensusMatch[] = [];

  for (const match of matches.values()) {
    if (match.picks === 0) continue;

    const marketList: ConsensusMarket[] = [...match.markets.values()]
      .map((market) => {
        const hasDistribution = market.options.size >= 2;
        const baseOptions = [...market.options.entries()].map(
          ([key, option]) => {
            const share = market.total > 0 ? option.count / market.total : 0;
            const averageOdds =
              option.oddsCount > 0
                ? roundOdds(option.oddsSum / option.oddsCount)
                : null;
            const history = historyStats.get(`${market.key}|${key}`);

            return {
              key,
              label: option.label,
              count: option.count,
              share,
              averageOdds,
              historyWins: history?.wins ?? 0,
              historySettled: history?.settled ?? 0,
            };
          },
        );

        const withOdds = baseOptions.filter(
          (option) => option.averageOdds !== null && option.averageOdds > 1,
        );
        const rawOddsSum = withOdds.reduce(
          (sum, option) => sum + 1 / (option.averageOdds as number),
          0,
        );

        const options: ConsensusOption[] = baseOptions.map((option) => {
          const marketProbability =
            option.averageOdds !== null && option.averageOdds > 1
              ? hasDistribution && rawOddsSum > 0
                ? (1 / option.averageOdds) / rawOddsSum
                : 1 / option.averageOdds
              : null;
          const prior = marketProbability ?? option.share;
          // Suavizado bayesiano: el histórico se acerca al prior del mercado
          // según cuántos resultados haya (k = 5 pseudo-picks).
          const shrunkHistory =
            option.historySettled > 0
              ? (option.historyWins + 5 * prior) /
                (option.historySettled + 5)
              : null;

          const marketWeight = marketProbability !== null ? 0.55 : 0;
          const historyWeight =
            shrunkHistory !== null
              ? Math.min(0.3, option.historySettled * 0.03)
              : 0;
          const consensusWeight = Math.min(0.15, market.total * 0.015);
          const totalWeight =
            marketWeight + historyWeight + consensusWeight;

          const blended =
            totalWeight > 0
              ? ((marketProbability ?? 0) * marketWeight +
                  (shrunkHistory ?? 0) * historyWeight +
                  option.share * consensusWeight) /
                totalWeight
              : option.share;

          return {
            key: option.key,
            label: option.label,
            count: option.count,
            share: option.share,
            averageOdds: option.averageOdds,
            marketProbability:
              marketProbability !== null
                ? roundProbability(marketProbability)
                : null,
            historyWins: option.historyWins,
            historySettled: option.historySettled,
            historyRate:
              option.historySettled > 0
                ? roundProbability(
                    option.historyWins / option.historySettled,
                  )
                : null,
            probability: roundProbability(blended),
          };
        });

        if (hasDistribution) {
          const sum = options.reduce(
            (total, option) => total + (option.probability ?? 0),
            0,
          );
          if (sum > 0) {
            for (const option of options) {
              option.probability = roundProbability(
                (option.probability ?? 0) / sum,
              );
            }
          }
        } else {
          const only = options[0];
          if (
            only &&
            only.marketProbability === null &&
            only.historySettled === 0
          ) {
            only.probability = null;
          }
        }

        options.sort(
          (a, b) =>
            (b.probability ?? b.share) - (a.probability ?? a.share) ||
            b.count - a.count ||
            a.label.localeCompare(b.label, "es"),
        );

        const leader = options[0];
        if (!leader) return null;

        return {
          key: market.key,
          label: market.label,
          total: market.total,
          options,
          leader,
          hasDistribution,
        };
      })
      .filter((market): market is ConsensusMarket => market !== null);

    const byTotal = [...marketList].sort(
      (a, b) =>
        b.total - a.total ||
        b.leader.share - a.leader.share ||
        a.label.localeCompare(b.label, "es"),
    );

    const primaryByProbability = (markets: ConsensusMarket[]) =>
      [...markets].sort(
        (a, b) =>
          (b.leader.probability ?? 0) - (a.leader.probability ?? 0) ||
          b.total - a.total ||
          a.label.localeCompare(b.label, "es"),
      )[0];

    const primary =
      primaryByProbability(
        byTotal.filter((market) => market.hasDistribution),
      ) ??
      primaryByProbability(
        byTotal.filter(
          (market) =>
            !market.hasDistribution && market.leader.probability !== null,
        ),
      ) ??
      byTotal[0];

    if (!primary) continue;

    const markets: ConsensusMarket[] = [
      primary,
      ...byTotal.filter((market) => market.key !== primary.key),
    ];

    result.push({
      key: match.key,
      eventName: match.eventName,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: match.sport,
      competition: match.competition,
      eventDate: match.eventDate,
      picks: match.picks,
      users: match.userIds.size,
      averageOdds:
        match.oddsCount > 0
          ? roundOdds(match.oddsSum / match.oddsCount)
          : null,
      markets,
      primary,
    });
  }

  result.sort(
    (a, b) =>
      a.eventDate.getTime() - b.eventDate.getTime() ||
      b.picks - a.picks ||
      a.eventName.localeCompare(b.eventName, "es"),
  );

  const history: HistoryStat[] = [...historyStats.entries()]
    .map(([key, stat]) => ({
      key,
      marketLabel: stat.marketLabel,
      optionLabel: stat.optionLabel,
      wins: stat.wins,
      settled: stat.settled,
      rate:
        stat.settled > 0
          ? roundProbability(stat.wins / stat.settled)
          : 0,
      averageOdds:
        stat.oddsCount > 0
          ? roundOdds(stat.oddsSum / stat.oddsCount)
          : null,
    }))
    .sort(
      (a, b) =>
        b.settled - a.settled ||
        b.rate - a.rate ||
        a.marketLabel.localeCompare(b.marketLabel, "es"),
    )
    .slice(0, 20);

  return {
    matches: result,
    totalPicks,
    totalUsers: allUsers.size,
    history,
  };
}
