import { MODEL_MARKET_CAVEAT } from "@/lib/analysis/constants";
import type {
  AnalysisDetail,
  AnalysisFeedItem,
  AnalysisTeamForm,
} from "@/lib/analysis/view";
import type { ModelAccuracy } from "@/lib/data/analysis";
import type { AnalysisDataStatus } from "@/lib/data/analysis-status";
import type { ForwardAccuracy } from "@/lib/analysis/forward";

const reference = {
  hasMarketBacktest: true,
  sample: 470,
  modelBrier: 0.6247,
  marketBrier: 0.6084,
  marketPreBrier: 0.6102,
  naiveBrier: 0.6577,
  asOf: "2026-11-02T12:00:00.000Z",
};

const unavailableSource = (
  key: "market" | "model" | "community" | "private",
  label: string,
  note: string,
) => ({
  key,
  label,
  available: false,
  confidence: "INSUFFICIENT" as const,
  probabilities: null,
  totals: null,
  sample: null,
  note,
});

/** Fixture de test: cuotas de mercado sembradas, nunca datos de producción. */
export function buildMarketItem(
  overrides: Partial<AnalysisFeedItem> = {},
): AnalysisFeedItem {
  const market = { home: 0.5, draw: 0.25, away: 0.25 };
  const model = { home: 0.45, draw: 0.3, away: 0.25 };

  return {
    id: "analysis-market",
    fixtureId: "fixture-market",
    competition: "Premier League",
    competitionCode: "E0",
    kickoff: new Date("2026-11-10T20:00:00.000Z"),
    homeName: "Arsenal",
    awayName: "Chelsea",
    homeTeamId: "team-home",
    awayTeamId: "team-away",
    final: {
      available: true,
      source: "market",
      probabilities: market,
      totals: { over25: 0.55, under25: 0.45 },
      confidence: "HIGH",
      weight: 0,
      temperature: 1,
      note: "Mercado como fuente principal; el modelo se muestra aparte porque no mejoró la mezcla",
    },
    sources: {
      market: {
        key: "market",
        label: "Mercado",
        available: true,
        confidence: "HIGH",
        probabilities: market,
        totals: { over25: 0.55, under25: 0.45 },
        sample: 8,
        note: "Promedio de cierre sin margen",
      },
      model: {
        key: "model",
        label: "Modelo estadístico",
        available: true,
        confidence: "MEDIUM",
        probabilities: model,
        totals: { over25: 0.5, under25: 0.5 },
        btts: 0.52,
        sample: 400,
        note: MODEL_MARKET_CAVEAT,
      },
      community: unavailableSource(
        "community",
        "Comunidad",
        "Muestra insuficiente (2 usuarios; mínimo 5)",
      ),
      private: unavailableSource(
        "private",
        "Tu historial",
        "Sin historial propio para este partido",
      ),
    },
    reference,
    naiveReference: {
      brier: 0.6577,
      sample: 470,
      probabilities: [0.45, 0.26, 0.29],
    },
    notes: [MODEL_MARKET_CAVEAT],
    ...overrides,
  };
}

/** Fixture de test: modelo sin cuotas de mercado. */
export function buildModelItem(
  overrides: Partial<AnalysisFeedItem> = {},
): AnalysisFeedItem {
  const model = { home: 0.45, draw: 0.3, away: 0.25 };
  const base = buildMarketItem();

  return {
    ...base,
    id: "analysis-model",
    fixtureId: "fixture-model",
    final: {
      available: true,
      source: "model",
      probabilities: model,
      totals: { over25: 0.5, under25: 0.5 },
      confidence: "LOW",
      weight: 0,
      temperature: 1,
      note: `${MODEL_MARKET_CAVEAT}. Sin mercado disponible.`,
    },
    sources: {
      ...base.sources,
      market: unavailableSource("market", "Mercado", "Sin cuotas para este partido"),
      model: {
        ...base.sources.model,
        confidence: "LOW",
        probabilities: model,
        note: MODEL_MARKET_CAVEAT,
      },
    },
    ...overrides,
  };
}

/** Fixture de test: ni mercado ni modelo. */
export function buildNoDataItem(
  overrides: Partial<AnalysisFeedItem> = {},
): AnalysisFeedItem {
  const base = buildMarketItem();

  return {
    ...base,
    id: "analysis-none",
    fixtureId: "fixture-none",
    final: {
      available: false,
      source: "none",
      probabilities: null,
      totals: null,
      confidence: "INSUFFICIENT",
      weight: 0,
      temperature: 1,
      note: "Sin datos suficientes",
    },
    sources: {
      market: unavailableSource("market", "Mercado", "Sin cuotas para este partido"),
      model: unavailableSource(
        "model",
        "Modelo estadístico",
        "Modelo no disponible",
      ),
      community: unavailableSource(
        "community",
        "Comunidad",
        "Muestra insuficiente (0 usuarios; mínimo 5)",
      ),
      private: unavailableSource(
        "private",
        "Tu historial",
        "Sin historial propio para este partido",
      ),
    },
    notes: [],
    ...overrides,
  };
}

function teamForm(
  teamId: string,
  teamName: string,
  opponent: string,
): AnalysisTeamForm {
  return {
    teamId,
    teamName,
    matches: [
      {
        id: `${teamId}-last-1`,
        playedAt: new Date("2026-11-02T12:00:00.000Z"),
        competition: "Premier League",
        opponent,
        venue: "home",
        goalsFor: 2,
        goalsAgainst: 1,
        result: "W",
      },
    ],
    summary: {
      played: 1,
      wins: 1,
      draws: 0,
      losses: 0,
      goalsFor: 2,
      goalsAgainst: 1,
    },
  };
}

export function buildDetail(
  item: AnalysisFeedItem = buildMarketItem(),
): AnalysisDetail {
  return {
    ...item,
    form: {
      home: teamForm("team-home", item.homeName, item.awayName),
      away: teamForm("team-away", item.awayName, item.homeName),
    },
    h2h: {
      matches: [
        {
          id: "h2h-1",
          playedAt: new Date("2026-05-01T12:00:00.000Z"),
          competition: "Premier League",
          homeName: item.homeName,
          awayName: item.awayName,
          homeGoals: 1,
          awayGoals: 1,
        },
      ],
      summary: { played: 1, homeWins: 0, draws: 1, awayWins: 0 },
    },
    privateLegs: [
      {
        id: "leg-1",
        status: "PENDING",
        eventName: `${item.homeName} vs ${item.awayName}`,
        eventDate: item.kickoff,
        odds: 1.85,
        selections: [
          {
            id: "selection-1",
            market: "Resultado final (1X2)",
            selection: "Local",
            pick: "HOME",
            line: null,
          },
        ],
      },
    ],
    quality: {
      generatedAt: "2026-11-06T10:00:00.000Z",
      marketCapturedAt: "2026-11-06T09:00:00.000Z",
      marketFresh: true,
      modelSample: 400,
      sourcesUsed: ["sports-api:football-data"],
      fixtureIds: ["fixture-1"],
      referenceAsOf: reference.asOf,
    },
  };
}

const competitionEntry = {
  code: "E0",
  weight: 0,
  temperature: 1,
  calibrationApplied: false,
  blendApplied: false,
  sample: 470,
  preSample: 470,
  modelBrier: 0.6247,
  modelLogLoss: 1.0393,
  marketBrier: 0.6083,
  marketLogLoss: 1.0131,
  marketPreBrier: 0.6102,
  naiveBrier: 0.6576,
  calibratedBrier: 0.6469,
  calibratedLogLoss: 1.0701,
  blendTestSample: 108,
  blendTestMarketBrier: 0.6253,
  blendTestBrier: 0.6253,
  blendImproved: false,
  asOf: "2026-11-02T12:00:00.000Z",
  hasMarketBacktest: true,
};

export const accuracyFixture: ModelAccuracy = {  generatedFrom: "2025-07-24T00:00:00.000Z",
  model: "poisson-dc-v1",
  caveat: MODEL_MARKET_CAVEAT,
  holdout: {
    start: "2025-07-24T00:00:00.000Z",
    end: "2026-11-06T12:00:00.000Z",
  },
  global: {
    ...competitionEntry,
    code: null,
    sample: 3485,
    preSample: 0,
    modelBrier: 0.6141,
    marketBrier: 0.5903,
    naiveBrier: 0.6467,
    marketPreBrier: null,
  },
  competitions: [
    { competition: "Premier League", ...competitionEntry },
    {
      competition: "LaLiga",
      ...competitionEntry,
      code: "SP1",
      sample: 489,
      preSample: 489,
      modelBrier: 0.5907,
      marketBrier: 0.5633,
      marketPreBrier: 0.5649,
      naiveBrier: 0.6341,
    },
    {
      competition: "Brasileirão Serie A",
      ...competitionEntry,
      code: "BRA",
      sample: 575,
      preSample: 0,
      modelBrier: 0.6075,
      marketBrier: 0.5847,
      marketPreBrier: null,
      naiveBrier: 0.6281,
    },
  ],
};

export const dataStatusFixture: AnalysisDataStatus = {
  now: "2026-11-07T12:00:00.000Z",
  lastHistoricalImportAt: "2026-11-07T10:00:00.000Z",
  lastFixtureImportAt: "2026-11-07T10:05:00.000Z",
  fixtureBatch: {
    sourceFile: "data-football/fixtures/fixtures.csv",
    capturedAt: "2026-11-07T10:05:00.000Z",
    rowCount: 154,
    ageDays: 0,
    stale: false,
  },
  lastRun: {
    status: "SUCCESS",
    startedAt: "2026-11-07T11:00:00.000Z",
    finishedAt: "2026-11-07T11:01:00.000Z",
    durationMs: 60000,
    error: null,
    steps: [
      { name: "import", status: "success", durationMs: 1000 },
      { name: "sync", status: "success", durationMs: 59000 },
      { name: "generate", status: "success", durationMs: 0 },
    ],
  },
  marketMissing: false,
  marketStale: false,
};

export const forwardFixture: ForwardAccuracy = {
  sample: 12,
  modelSample: 12,
  marketSample: 12,
  modelBrier: 0.618,
  marketBrier: 0.594,
  modelLogLoss: 1.031,
  marketLogLoss: 1.002,
  since: "2026-10-01T12:00:00.000Z",
  competitions: [
    {
      competition: "Premier League",
      code: "E0",
      sample: 12,
      modelSample: 12,
      marketSample: 12,
      modelBrier: 0.618,
      marketBrier: 0.594,
      modelLogLoss: 1.031,
      marketLogLoss: 1.002,
    },
  ],
};
