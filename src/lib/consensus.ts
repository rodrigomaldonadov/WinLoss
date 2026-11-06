import type { LegMarketKey } from "@prisma/client";

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

export type ConsensusOption = {
  key: string;
  label: string;
  count: number;
  /** 0–1 dentro del mercado. */
  share: number;
  averageOdds: number | null;
};

export type ConsensusMarket = {
  key: string;
  label: string;
  total: number;
  options: ConsensusOption[];
  leader: ConsensusOption;
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

/**
 * Agrupa los picks de partidos próximos por evento y mercado.
 *
 * Los datos son agregados: la salida nunca incluye identificadores de usuario,
 * solo el número de usuarios distintos que respaldan cada partido.
 */
export function aggregateConsensus(
  legs: ConsensusLegInput[],
  options: { now?: Date; days?: number } = {},
): ConsensusResult {
  const now = options.now ?? new Date();
  const cutoff = options.days
    ? new Date(now.getTime() + options.days * DAY_MS)
    : null;
  const matches = new Map<string, MatchAccumulator>();
  const allUsers = new Set<string>();
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

    const markets: ConsensusMarket[] = [...match.markets.values()]
      .map((market) => {
        const options: ConsensusOption[] = [...market.options.entries()]
          .map(([key, option]) => ({
            key,
            label: option.label,
            count: option.count,
            share: market.total > 0 ? option.count / market.total : 0,
            averageOdds:
              option.oddsCount > 0
                ? roundOdds(option.oddsSum / option.oddsCount)
                : null,
          }))
          .sort(
            (a, b) =>
              b.count - a.count || a.label.localeCompare(b.label, "es"),
          );

        const leader = options[0];
        if (!leader) return null;

        return {
          key: market.key,
          label: market.label,
          total: market.total,
          options,
          leader,
        };
      })
      .filter((market): market is ConsensusMarket => market !== null)
      .sort(
        (a, b) =>
          b.total - a.total ||
          b.leader.share - a.leader.share ||
          a.label.localeCompare(b.label, "es"),
      );

    const primary = markets[0];
    if (!primary) continue;

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

  return {
    matches: result,
    totalPicks,
    totalUsers: allUsers.size,
  };
}
