import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({
      href,
      children,
      ...props
    }: {
      href: string;
      children?: ReactNode;
      [key: string]: unknown;
    }) => React.createElement("a", { href, ...props }, children),
  };
});

import { AnalysisCard, NoAnalysisCard } from "@/components/analysis/analysis-card";
import { AnalysisDetailView } from "@/components/analysis/analysis-detail-view";
import {
  DataStatusDetails,
  DataStatusNotice,
  formatAgeDays,
} from "@/components/analysis/data-status";
import { ModelAccuracyPanel } from "@/components/analysis/model-accuracy-panel";
import { BookmakerOddsComparator, comparisonText } from "@/components/analysis/odds-comparator";
import {
  analysisBetHref,
  bttsPick,
  matchResultPick,
  totalGoalsPick,
} from "@/lib/analysis/view";
import {
  accuracyFixture,
  buildDetail,
  buildMarketItem,
  buildModelItem,
  buildNoDataItem,
  dataStatusFixture,
  forwardFixture,
} from "@/test/fixtures/analysis";

describe("tarjetas de /analysis", () => {
  it("muestra el mercado, los chips y la tarjeta completa tocable", () => {
    const item = buildMarketItem();
    const html = renderToStaticMarkup(<AnalysisCard item={item} />);

    expect(html).toContain("Probabilidad del mercado (sin margen)");
    expect(html).toContain("50%");
    expect(html).toContain("Registrar apuesta");
    expect(html).toContain("analisis=analysis-market");
    expect(html).toContain("mercadoKey=MATCH_RESULT");
    expect(html).toContain("mercadoKey=TOTAL_GOALS");
    expect(html).toContain("mercadoKey=BTTS");
    expect(html).toContain('aria-label="Ver detalle de Arsenal vs Chelsea"');
    expect(html).toContain('href="/analysis/analysis-market"');
    expect(html).not.toContain("Ver detalle<");
    expect(html).not.toContain("Comparador de cuotas justas");
  });

  it("precarga mercado, línea y selección desde los chips", () => {
    const item = buildMarketItem();
    const match = new URL(
      analysisBetHref(item, matchResultPick("away")),
      "https://winloss.test",
    );
    expect(match.searchParams.get("mercadoKey")).toBe("MATCH_RESULT");
    expect(match.searchParams.get("mercado")).toBe("Resultado final (1X2)");
    expect(match.searchParams.get("seleccion")).toBe("Visitante");
    expect(match.searchParams.get("pick")).toBe("AWAY");

    const goals = new URL(
      analysisBetHref(item, totalGoalsPick("OVER", 2.5)),
      "https://winloss.test",
    );
    expect(goals.searchParams.get("mercadoKey")).toBe("TOTAL_GOALS");
    expect(goals.searchParams.get("linea")).toBe("2.5");
    expect(goals.searchParams.get("seleccion")).toBe("Más de 2.5");

    const btts = new URL(
      analysisBetHref(item, bttsPick("YES")),
      "https://winloss.test",
    );
    expect(btts.searchParams.get("mercadoKey")).toBe("BTTS");
    expect(btts.searchParams.get("seleccion")).toBe("Sí");
  });

  it("muestra el modelo sin cuotas y confianza baja", () => {
    const item = buildModelItem();
    const html = renderToStaticMarkup(<AnalysisCard item={item} />);

    expect(html).toContain("Estimación del modelo (sin cuotas)");
    expect(html).toContain("Confianza baja");
    expect(html).not.toContain("Comparador de cuotas justas");
    expect(html).not.toContain(
      "En pruebas, el mercado superó a este modelo en todas las ligas",
    );
  });

  it("no sube la confianza del modelo cuando no hay cuotas de mercado", () => {
    const item = buildModelItem();
    const medium = {
      ...item,
      final: { ...item.final, confidence: "MEDIUM" as const },
      sources: {
        ...item.sources,
        model: { ...item.sources.model, confidence: "MEDIUM" as const },
      },
    };
    const html = renderToStaticMarkup(<AnalysisCard item={medium} />);

    expect(html).toContain("Confianza baja");
    expect(html).not.toContain("Confianza media");
  });

  it("deja los partidos sin datos en una tarjeta sin probabilidades", () => {
    const item = buildNoDataItem();
    const html = renderToStaticMarkup(<NoAnalysisCard item={item} />);

    expect(html).toContain("Sin análisis disponible para este partido");
    expect(html).toContain("Registrar apuesta");
    expect(html).toContain("analisis=analysis-none");
    expect(html).not.toContain("Probabilidad del mercado");
    expect(html).not.toContain("Estimación del modelo");
    expect(html).not.toMatch(/>\s*\d+%\s*</);
  });

  it("precarga /bets/new con evento, competición, fecha y origen", () => {
    const href = analysisBetHref(buildMarketItem());
    const url = new URL(href, "https://winloss.test");

    expect(url.pathname).toBe("/bets/new");
    expect(url.searchParams.get("evento")).toBe("Arsenal vs Chelsea");
    expect(url.searchParams.get("competicion")).toBe("Premier League");
    expect(url.searchParams.get("fecha")).toBe("2026-11-10T20:00:00.000Z");
    expect(url.searchParams.get("deporte")).toBe("Fútbol");
    expect(url.searchParams.get("origen")).toBe("Consenso");
    expect(url.searchParams.get("analisis")).toBe("analysis-market");
  });
});

describe("detalle de /analysis", () => {
  it("incluye probabilidades, fuentes, forma, historial y calidad", () => {
    const html = renderToStaticMarkup(
      <AnalysisDetailView
        detail={buildDetail()}
        dataStatus={dataStatusFixture}
      />,
    );

    expect(html).toContain("Probabilidades");
    expect(html).toContain("Fuentes");
    expect(html).toContain("Forma reciente y H2H");
    expect(html).toContain("Tu historial");
    expect(html).toContain("Calidad de datos");
    expect(html).toContain("Comparador de cuotas justas");
    expect(html).toContain("Cuotas capturadas");
    expect(html).toContain("Arsenal");
    expect(html).toContain("Chelsea");
    expect(html).toContain("Resultados API hoy");
    expect(html).toContain("Último reajuste de ratings");
    expect(html).toContain("Modelo activo");
    expect(html).toContain("Retador en observación");
  });
});

describe("comparador con cuota de la casa", () => {
  it("compara la cuota del usuario con la cuota justa y usa texto neutro", () => {
    expect(comparisonText("2,10", 2).text).toBe(
      "5% mejor que la cuota justa del mercado.",
    );
    expect(comparisonText("1,90", 2).text).toBe(
      "5% peor que la cuota justa del mercado.",
    );
    expect(comparisonText("2", 2).text).toBe(
      "Tu cuota coincide con la cuota justa del mercado.",
    );
    expect(comparisonText("", 2).text).toBe(
      "Escribe una cuota mayor que 1 para comparar.",
    );
  });

  it("renderiza el campo de cuota sin lenguaje de recomendación", () => {
    const item = buildMarketItem();
    const html = renderToStaticMarkup(
      <BookmakerOddsComparator
        market={item.sources.market.probabilities!}
        model={item.sources.model.probabilities}
      />,
    );

    expect(html).toContain("Comparador de cuotas justas");
    expect(html).toContain("Cuota de tu casa");
    expect(html).toContain("Cuota justa del mercado");
    expect(html).toContain("Solo comparación");
    expect(html).not.toMatch(/valor|ventaja|oportunidad/i);
  });
});

describe("estado de los datos", () => {
  it("no muestra aviso cuando todo está bien", () => {
    const html = renderToStaticMarkup(
      <DataStatusNotice status={dataStatusFixture} />,
    );
    expect(html).toBe("");
  });

  it("avisa cuando la fuente de mercado está desactualizada", () => {
    const stale = {
      ...dataStatusFixture,
      fixtureBatch: {
        ...dataStatusFixture.fixtureBatch!,
        capturedAt: "2026-10-30T10:05:00.000Z",
        ageDays: 8,
        stale: true,
      },
      marketStale: true,
    };
    const html = renderToStaticMarkup(<DataStatusNotice status={stale} />);

    expect(html).toContain("Fuente de mercado desactualizada");
    expect(html).toContain("La fuente Mercado se oculta");
    expect(html).toContain("hace 8 días");
  });

  it("usa edades legibles", () => {
    expect(formatAgeDays(0)).toBe("hoy");
    expect(formatAgeDays(1)).toBe("hace 1 día");
    expect(formatAgeDays(8)).toBe("hace 8 días");
  });

  it("muestra el error del paso fallido y cómo reactivar el mercado", () => {
    const failed = {
      ...dataStatusFixture,
      fixtureBatch: {
        ...dataStatusFixture.fixtureBatch!,
        capturedAt: "2026-10-30T10:05:00.000Z",
        ageDays: 8,
        stale: true,
      },
      marketStale: true,
      lastRun: {
        ...dataStatusFixture.lastRun!,
        status: "PARTIAL",
        steps: [
          {
            name: "results",
            status: "failed",
            durationMs: 1000,
            error:
              "results thesportsdb Liga 1: Error: 429 Too Many Requests",
          },
        ],
      },
    };

    const notice = renderToStaticMarkup(<DataStatusNotice status={failed} />);
    expect(notice).toContain("429 Too Many Requests");

    const details = renderToStaticMarkup(<DataStatusDetails status={failed} />);
    expect(details).toContain("429 Too Many Requests");
    expect(details).toContain("fixtures.csv nuevo");
  });
});

describe("panel de precisión del modelo", () => {
  it("muestra N, periodo y baselines de cierre, pre-cierre e ingenua", () => {
    const html = renderToStaticMarkup(
      <ModelAccuracyPanel accuracy={accuracyFixture} forward={forwardFixture} />,
    );

    expect(html).toContain("Precisión del modelo");
    expect(html).toContain("3485");
    expect(html).toContain("2025");
    expect(html).toContain("Mercado cierre");
    expect(html).toContain("El mercado ganó en 3 de 3 ligas");
    expect(html).toContain("Pre-cierre");
    expect(html).toContain("Ingenua");
    expect(html).toContain("por qué cambia N");
    expect(html).toContain("Desde que está en uso");
    expect(html).toContain("Forward test");
    expect(html).toContain("N=12");
    expect(html).toContain("Muestra pequeña");
  });
});
