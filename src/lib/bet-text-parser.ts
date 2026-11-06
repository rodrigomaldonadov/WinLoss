import type { LegMarketKey } from "@prisma/client";

export type ParsedSelection = {
  marketKey: LegMarketKey;
  /** Etiqueta canónica que se guarda en `market`. */
  market: string;
  /** Texto legible de la selección, tal como aparece en el boleto. */
  selection: string;
  line: number | null;
  pick: string | null;
  subject: string | null;
};

export type ParsedLeg = {
  eventName: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  competition: string;
  /** `YYYY-MM-DDTHH:mm` (wall-time) o null si el boleto no trae fecha. */
  eventDate: string | null;
  odds: number | null;
  isBuilder: boolean;
  selections: ParsedSelection[];
};

export type ParsedBet = {
  betType: "SINGLE" | "COMBINED";
  stake: number | null;
  totalOdds: number | null;
  currency: string | null;
  legs: ParsedLeg[];
  warnings: string[];
};

type ParseOptions = {
  /** Fecha de referencia para inferir el año (tests deterministas). */
  now?: Date;
};

type Token =
  | { kind: "market"; index: number; key: LegMarketKey; text: string }
  | {
      kind: "over";
      index: number;
      line: number;
      pick: "OVER" | "UNDER";
      text: string;
    }
  | { kind: "odds"; index: number; value: number }
  | { kind: "text"; index: number; text: string };

const MARKET_PATTERNS: { key: LegMarketKey; re: RegExp }[] = [
  { key: "TEAM_TOTAL_GOALS", re: /goles\s+(de|por)\s+(un\s+)?equipo/i },
  { key: "TOTAL_CORNERS", re: /c[oó]rneres?/i },
  { key: "TOTAL_CARDS", re: /tarjetas?/i },
  { key: "DOUBLE_CHANCE", re: /doble\s+oportunidad/i },
  { key: "DRAW_NO_BET", re: /empate\s+no\s+v[aá]lido|draw\s+no\s+bet|\bdnb\b/i },
  { key: "EXACT_TOTAL_GOALS", re: /total\s+exacto\s+de\s+goles/i },
  { key: "MATCH_RESULT", re: /resultado\s+(del|final)\s+(partido|final)|resultado\s+final|\b1x2\b/i },
  { key: "TOTAL_GOALS", re: /total\s+de\s+goles|goles\s+totales/i },
  { key: "BTTS", re: /ambos\s+(equipos\s+)?(anotan|marcan)|both\s+teams/i },
  { key: "ASIAN_HANDICAP", re: /h[aá]ndicap|handicap/i },
  { key: "ODD_EVEN", re: /par\s+o\s+impar/i },
  { key: "WIN_TO_NIL", re: /gana\s+sin\s+recibir|win\s+to\s+nil/i },
];

const MARKET_LABEL: Record<LegMarketKey, string> = {
  CUSTOM: "Otro mercado",
  MATCH_RESULT: "Resultado final (1X2)",
  DOUBLE_CHANCE: "Doble oportunidad",
  DRAW_NO_BET: "Empate no válido (DNB)",
  TOTAL_GOALS: "Total de goles",
  BTTS: "Ambos equipos marcan",
  ASIAN_HANDICAP: "Hándicap asiático",
  TEAM_TOTAL_GOALS: "Goles por equipo",
  ODD_EVEN: "Total par o impar",
  WIN_TO_NIL: "Gana sin recibir gol",
  EXACT_TOTAL_GOALS: "Total exacto de goles",
  TOTAL_CORNERS: "Córneres (más/menos)",
  TOTAL_CARDS: "Tarjetas (más/menos)",
  GENERIC_LINE: "Otro mercado con línea",
};

const LINE_MARKETS: LegMarketKey[] = [
  "TOTAL_GOALS",
  "TEAM_TOTAL_GOALS",
  "TOTAL_CORNERS",
  "TOTAL_CARDS",
  "GENERIC_LINE",
];

const DATE_RE =
  /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\s*[•·]\s*(\d{1,2}):(\d{2})/;
const OVER_UNDER_RE = /^(m[aá]s|menos)\s+de\s+(\d+(?:[.,]\d+)?)$/i;
const ODDS_RE = /^\d{1,4}[.,]\d{2,3}$/;
const INTEGER_RE = /^\d{1,3}$/;
const NOISE_RE =
  /^(crear\s+apuesta|compartir|ver\s+m[aá]s|ver\s+detalle|cuota\s+total|apuesta\s+total|ganancia\s+total|importe|stake)$/i;
const CURRENCY_AMOUNT_RE = /^(?:pen|s\/\.?|usd|eur|\$)\s*([\d.,]+)$/i;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized = cleaned;
  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = cleaned.length - lastComma - 1;
    normalized =
      decimals === 1 || decimals === 2
        ? cleaned.replace(",", ".")
        : cleaned.replace(/,/g, "");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function normalizeText(raw: string): string[] {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function amountAfter(lines: string[], label: RegExp): number | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!label.test(line)) continue;

    const inline = /([\d.,]+)\s*$/.exec(line);
    if (inline?.[1]) {
      const value = toNumber(inline[1]);
      if (value !== null) return value;
    }

    for (let offset = 1; offset <= 2; offset += 1) {
      const candidate = lines[index + offset];
      if (!candidate) continue;
      const value = toNumber(candidate);
      if (value !== null) return value;
    }
  }
  return null;
}

function extractStake(lines: string[]): number | null {
  const explicit = amountAfter(lines, /^apuesta\s+total/i);
  if (explicit !== null) return explicit;

  const stake = amountAfter(lines, /^(stake|importe)\b/i);
  if (stake !== null) return stake;

  for (const line of lines.slice(0, 8)) {
    const currency = CURRENCY_AMOUNT_RE.exec(line);
    if (currency?.[1]) {
      const value = toNumber(currency[1]);
      if (value !== null) return value;
    }
  }
  return null;
}

function extractTotalOdds(lines: string[]): number | null {
  const explicit = amountAfter(lines, /^cuota\s+total\b/i);
  if (explicit !== null) return explicit;

  for (const line of lines.slice(0, 8)) {
    const match = /^cuota\s*:?\s*([\d.,]+)$/i.exec(line);
    if (match?.[1]) {
      const value = toNumber(match[1]);
      if (value !== null && value > 1) return value;
    }
  }
  return null;
}

function extractBetType(lines: string[]): "SINGLE" | "COMBINED" | null {
  for (const line of lines.slice(0, 10)) {
    if (/^m[uú]ltiple\b/i.test(line) || /^combinad/i.test(line)) {
      return "COMBINED";
    }
    if (/^simple\b/i.test(line)) return "SINGLE";
  }
  return null;
}

type EventRef = {
  eventName: string;
  home: string;
  away: string;
  lineIndex: number;
};

function splitEventName(raw: string): { eventName: string; home: string; away: string } | null {
  const match = /^(.+?)\s+vs\.?\s+(.+)$/i.exec(raw.trim());
  if (!match?.[1] || !match[2]) return null;
  const home = match[1].trim().replace(/[.,;]+$/, "");
  const away = match[2].trim().replace(/[.,;]+$/, "");
  if (!home || !away) return null;
  return { eventName: `${home} vs ${away}`, home, away };
}

function extractEvents(lines: string[]): EventRef[] {
  const candidates = lines.slice(0, 30);

  const listLine = candidates.find(
    (line) => (line.match(/\bvs\.?\b/gi) ?? []).length >= 2,
  );

  if (listLine) {
    const index = lines.indexOf(listLine);
    const events = listLine
      .split(/\s*,\s*/)
      .map(splitEventName)
      .filter((event): event is NonNullable<typeof event> => event !== null)
      .map((event) => ({ ...event, lineIndex: index }));
    if (events.length > 0) return events;
  }

  const singleIndex = lines.findIndex((line) => /\bvs\.?\b/i.test(line));
  if (singleIndex > -1) {
    const parsed = splitEventName(lines[singleIndex] ?? "");
    if (parsed) return [{ ...parsed, lineIndex: singleIndex }];
  }

  return [];
}

function inferYear(
  day: number,
  month: number,
  hour: number,
  minute: number,
  now: Date,
): string {
  let year = now.getFullYear();
  const candidate = new Date(year, month - 1, day, hour, minute);
  if (candidate.getTime() - now.getTime() > 60 * 24 * 60 * 60 * 1000) {
    year -= 1;
  }
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

function parseDateLine(line: string, now: Date): string | null {
  const match = DATE_RE.exec(line);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (hour > 23 || minute > 59) return null;

  const rawYear = match[3];
  if (rawYear) {
    const year = rawYear.length === 2 ? Number(`20${rawYear}`) : Number(rawYear);
    if (Number.isFinite(year)) {
      return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
    }
  }

  return inferYear(day, month, hour, minute, now);
}

function cleanBlockLines(
  lines: string[],
  previous: EventRef | undefined,
): string[] {
  const previousTeams = previous
    ? [previous.home, previous.away].map((team) => team.toLowerCase())
    : [];

  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !NOISE_RE.test(line))
    .filter((line) => !CURRENCY_AMOUNT_RE.test(line))
    .filter((line) => !INTEGER_RE.test(line))
    .filter((line) => !/^cuota\s*:?\s*[\d.,]+$/i.test(line))
    .filter(
      (line) =>
        !previousTeams.some(
          (team) => line.toLowerCase().replace(/[.,;]+$/, "") === team,
        ),
    );
}

function marketFor(line: string): { key: LegMarketKey; label: string } | null {
  for (const pattern of MARKET_PATTERNS) {
    if (pattern.re.test(line)) {
      return { key: pattern.key, label: line };
    }
  }
  return null;
}

function buildTokens(lines: string[]): Token[] {
  const tokens: Token[] = [];

  lines.forEach((line, index) => {
    const market = marketFor(line);
    if (market) {
      tokens.push({ kind: "market", index, key: market.key, text: line });
      return;
    }

    const overUnder = OVER_UNDER_RE.exec(line);
    if (overUnder) {
      const value = toNumber(overUnder[2] ?? "");
      if (value !== null) {
        tokens.push({
          kind: "over",
          index,
          line: value,
          pick: overUnder[1]?.toLowerCase().startsWith("menos")
            ? "UNDER"
            : "OVER",
          text: line,
        });
        return;
      }
    }

    if (ODDS_RE.test(line)) {
      const value = toNumber(line);
      if (value !== null && value > 1 && value < 1000) {
        tokens.push({ kind: "odds", index, value });
        return;
      }
    }

    tokens.push({ kind: "text", index, text: line });
  });

  return tokens;
}

function nearestToken(
  tokens: Token[],
  from: number,
  predicate: (token: Token) => boolean,
  used: Set<number>,
  maxDistance = 2,
): Token | null {
  let best: Token | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const token of tokens) {
    if (used.has(token.index) || !predicate(token)) continue;
    const distance = Math.abs(token.index - from);
    if (distance > maxDistance) continue;
    if (distance < bestDistance) {
      best = token;
      bestDistance = distance;
    }
  }

  return best;
}

function normalizeTeam(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameTeam(a: string, b: string): boolean {
  const left = normalizeTeam(a);
  const right = normalizeTeam(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function matchResultPick(
  text: string,
  home: string,
  away: string,
): "HOME" | "DRAW" | "AWAY" | null {
  const normalized = normalizeTeam(text);
  if (!normalized) return null;
  if (/\bempate\b|\bdraw\b/.test(normalized)) return "DRAW";
  if (/\blocal\b/.test(normalized)) return "HOME";
  if (/\bvisitante\b/.test(normalized)) return "AWAY";
  if (sameTeam(text, home)) return "HOME";
  if (sameTeam(text, away)) return "AWAY";
  return null;
}

function doubleChancePick(
  text: string,
  home: string,
  away: string,
): "HOME_DRAW" | "HOME_AWAY" | "DRAW_AWAY" | null {
  const normalized = normalizeTeam(text);
  if (!normalized) return null;

  if (normalized === "1x" || normalized === "1 x") return "HOME_DRAW";
  if (normalized === "12" || normalized === "1 2") return "HOME_AWAY";
  if (normalized === "x2" || normalized === "x 2") return "DRAW_AWAY";

  if (!/\bempate\b/.test(normalized)) return null;
  if (sameTeam(text, home)) return "HOME_DRAW";
  if (sameTeam(text, away)) return "DRAW_AWAY";
  return null;
}

function overUnderSelection(
  key: LegMarketKey,
  token: Extract<Token, { kind: "over" }>,
): ParsedSelection {
  const base = `${token.pick === "UNDER" ? "Menos" : "Más"} de ${token.line}`;
  const selection =
    key === "TOTAL_CORNERS"
      ? `${base} córneres`
      : key === "TOTAL_CARDS"
        ? `${base} tarjetas`
        : base;

  return {
    marketKey: key,
    market: MARKET_LABEL[key],
    selection,
    line: token.line,
    pick: token.pick,
    subject: null,
  };
}

function parseBlock(
  lines: string[],
  event: EventRef,
  previous: EventRef | undefined,
): { selections: ParsedSelection[]; odds: number | null } {
  const cleaned = cleanBlockLines(lines, previous);
  const tokens = buildTokens(cleaned);
  const used = new Set<number>();
  const selections: ParsedSelection[] = [];

  for (const token of tokens) {
    if (token.kind !== "market" || used.has(token.index)) continue;
    const key = token.key;

    if (LINE_MARKETS.includes(key)) {
      const over = nearestToken(
        tokens,
        token.index,
        (candidate) => candidate.kind === "over",
        used,
      );
      if (over?.kind === "over") {
        used.add(over.index);
        selections.push(overUnderSelection(key, over));
      }
      continue;
    }

    if (key === "BTTS") {
      const pickToken = nearestToken(
        tokens,
        token.index,
        (candidate) =>
          candidate.kind === "text" && /^(s[ií]|no)$/i.test(candidate.text),
        used,
      );
      if (pickToken?.kind === "text") {
        used.add(pickToken.index);
        const yes = /^s[ií]$/i.test(pickToken.text);
        selections.push({
          marketKey: "BTTS",
          market: MARKET_LABEL.BTTS,
          selection: yes ? "Sí" : "No",
          line: null,
          pick: yes ? "YES" : "NO",
          subject: null,
        });
      }
      continue;
    }

    if (key === "DOUBLE_CHANCE") {
      const pickToken = nearestToken(
        tokens,
        token.index,
        (candidate) =>
          candidate.kind === "text" &&
          doubleChancePick(candidate.text, event.home, event.away) !== null,
        used,
      );
      if (pickToken?.kind === "text") {
        const pick = doubleChancePick(
          pickToken.text,
          event.home,
          event.away,
        );
        if (pick) {
          used.add(pickToken.index);
          selections.push({
            marketKey: "DOUBLE_CHANCE",
            market: MARKET_LABEL.DOUBLE_CHANCE,
            selection: pickToken.text,
            line: null,
            pick,
            subject: null,
          });
        }
      }
      continue;
    }

    if (
      key === "MATCH_RESULT" ||
      key === "DRAW_NO_BET" ||
      key === "WIN_TO_NIL"
    ) {
      const pickToken = nearestToken(
        tokens,
        token.index,
        (candidate) =>
          candidate.kind === "text" &&
          matchResultPick(candidate.text, event.home, event.away) !== null,
        used,
      );
      if (pickToken?.kind === "text") {
        const pick = matchResultPick(
          pickToken.text,
          event.home,
          event.away,
        );
        if (pick === "HOME" || pick === "AWAY" || pick === "DRAW") {
          used.add(pickToken.index);
          if (key === "DRAW_NO_BET" && pick === "DRAW") continue;
          selections.push({
            marketKey: key,
            market: MARKET_LABEL[key],
            selection: pickToken.text,
            line: null,
            pick,
            subject: null,
          });
        }
      }
      continue;
    }

    if (key === "ODD_EVEN") {
      const pickToken = nearestToken(
        tokens,
        token.index,
        (candidate) =>
          candidate.kind === "text" && /^(par|impar)$/i.test(candidate.text),
        used,
      );
      if (pickToken?.kind === "text") {
        used.add(pickToken.index);
        const odd = /^impar$/i.test(pickToken.text);
        selections.push({
          marketKey: "ODD_EVEN",
          market: MARKET_LABEL.ODD_EVEN,
          selection: odd ? "Impar" : "Par",
          line: null,
          pick: odd ? "ODD" : "EVEN",
          subject: null,
        });
      }
      continue;
    }

    if (key === "EXACT_TOTAL_GOALS") {
      const numberToken = nearestToken(
        tokens,
        token.index,
        (candidate) =>
          candidate.kind === "text" && /^\d{1,2}$/.test(candidate.text),
        used,
      );
      if (numberToken?.kind === "text") {
        used.add(numberToken.index);
        selections.push({
          marketKey: "EXACT_TOTAL_GOALS",
          market: MARKET_LABEL.EXACT_TOTAL_GOALS,
          selection: `${numberToken.text} goles exactos`,
          line: Number(numberToken.text),
          pick: "EXACT",
          subject: null,
        });
      }
      continue;
    }

    // Hándicap y mercados no reconocidos: si hay un texto cercano, se usa
    // como selección libre para no perder el pick.
    const freeText = nearestToken(
      tokens,
      token.index,
      (candidate) => candidate.kind === "text",
      used,
    );
    if (freeText?.kind === "text") {
      used.add(freeText.index);
      selections.push({
        marketKey: "CUSTOM",
        market: token.text,
        selection: freeText.text,
        line: null,
        pick: null,
        subject: null,
      });
    }
  }

  // Over/under sin mercado explícito: se asume total de goles del partido.
  for (const token of tokens) {
    if (token.kind !== "over" || used.has(token.index)) continue;
    used.add(token.index);
    selections.push(overUnderSelection("TOTAL_GOALS", token));
  }

  if (selections.length === 0) {
    const textTokens = tokens.filter(
      (token): token is Extract<Token, { kind: "text" }> =>
        token.kind === "text",
    );

    for (const token of textTokens) {
      const pick = matchResultPick(token.text, event.home, event.away);
      if (!pick) continue;
      selections.push({
        marketKey: "MATCH_RESULT",
        market: MARKET_LABEL.MATCH_RESULT,
        selection: token.text,
        line: null,
        pick,
        subject: null,
      });
      break;
    }

    if (selections.length === 0) {
      const [market, selection] = textTokens;
      if (market) {
        selections.push({
          marketKey: "CUSTOM",
          market: market.text,
          selection: selection?.text ?? market.text,
          line: null,
          pick: null,
          subject: null,
        });
      }
    }
  }

  const oddsToken = [...tokens]
    .reverse()
    .find((token) => token.kind === "odds" && !used.has(token.index));

  return {
    selections,
    odds: oddsToken?.kind === "odds" ? oddsToken.value : null,
  };
}

function extractCurrency(raw: string): string | null {
  if (/\bPEN\b|S\/\.?/i.test(raw)) return "PEN";
  if (/\bUSD\b|\$/.test(raw)) return "USD";
  if (/\bEUR\b|€/.test(raw)) return "EUR";
  return null;
}

/**
 * Convierte el texto copiado de una casa de apuestas (probado con el formato
 * de Apuesta Total) en legs listos para el formulario.
 */
export function parseBetText(raw: string, options: ParseOptions = {}): ParsedBet {
  const now = options.now ?? new Date();
  const lines = normalizeText(raw);
  const warnings: string[] = [];
  const currency = extractCurrency(raw);

  if (lines.length === 0) {
    return {
      betType: "SINGLE",
      stake: null,
      totalOdds: null,
      currency: null,
      legs: [],
      warnings: ["Pega el texto del boleto para analizarlo."],
    };
  }

  const stake = extractStake(lines);
  const totalOdds = extractTotalOdds(lines);
  const declaredType = extractBetType(lines);
  const events = extractEvents(lines);

  if (!stake) warnings.push("No se detectó el stake. Escríbelo a mano.");
  if (!totalOdds) {
    warnings.push("No se detectó la cuota total. Se calculará con los partidos.");
  }
  if (events.length === 0) {
    warnings.push(
      "No se detectaron partidos. Asegúrate de incluir las líneas “Equipo A vs Equipo B”.",
    );
  }

  if (events.length === 0) {
    return {
      betType: declaredType ?? "SINGLE",
      stake,
      totalOdds,
      currency,
      legs: [],
      warnings,
    };
  }

  const bodyStart = (events[0]?.lineIndex ?? 0) + 1;
  const dateEntries: { index: number; value: string }[] = [];

  for (let index = bodyStart; index < lines.length; index += 1) {
    const value = parseDateLine(lines[index] ?? "", now);
    if (value) dateEntries.push({ index, value });
  }

  const legs: ParsedLeg[] = [];
  let previousDateIndex = bodyStart - 1;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) continue;

    let eventDate: string | null = null;
    let blockLines: string[];

    if (dateEntries.length > 0) {
      const entry = dateEntries[index];
      if (entry) {
        const start = Math.max(previousDateIndex + 1, bodyStart);
        blockLines = lines.slice(start, entry.index);
        eventDate = entry.value;
        previousDateIndex = entry.index;
      } else {
        blockLines = [];
      }
    } else {
      blockLines = lines.slice(bodyStart);
    }

    const { selections, odds } = parseBlock(
      blockLines,
      event,
      events[index - 1],
    );

    if (selections.length === 0) {
      warnings.push(`No se pudo leer la selección de “${event.eventName}”.`);
    }

    legs.push({
      eventName: event.eventName,
      homeTeam: event.home,
      awayTeam: event.away,
      sport: "Fútbol",
      competition: "",
      eventDate,
      odds,
      isBuilder: selections.length > 1,
      selections,
    });
  }

  if (dateEntries.length > 0 && dateEntries.length !== events.length) {
    warnings.push(
      `El boleto tiene ${events.length} partido(s) y ${dateEntries.length} fecha(s); revisa el orden de los legs.`,
    );
  }

  const betType =
    declaredType ??
    (legs.length > 1 ? "COMBINED" : "SINGLE");

  return {
    betType,
    stake,
    totalOdds,
    currency,
    legs,
    warnings: [...new Set(warnings)],
  };
}
