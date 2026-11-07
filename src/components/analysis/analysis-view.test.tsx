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
import { ModelAccuracyPanel } from "@/components/analysis/model-accuracy-panel";
import { analysisBetHref } from "@/lib/analysis/view";
import {
  accuracyFixture,
  buildDetail,
  buildMarketItem,
  buildModelItem,
  buildNoDataItem,
} from "@/test/fixtures/analysis";

describe("tarjetas de /analysis", () => {
  it("muestra el mercado sin margen y el comparador de cuotas justas", () => {
    const item = buildMarketItem();
    const html = renderToStaticMarkup(<AnalysisCard item={item} />);

    expect(html).toContain("Probabilidad del mercado (sin margen)");
    expect(html).toContain("50%");
    expect(html).toContain("Comparador de cuotas justas");
    expect(html).toContain("Cuota justa = 1 / probabilidad");
    expect(html).toContain("+11%");
    expect(html).toContain("Registrar apuesta");
    expect(html).toContain("analisis=analysis-market");
  });

  it("muestra el modelo sin cuotas, confianza baja y el aviso fijo", () => {
    const item = buildModelItem();
    const html = renderToStaticMarkup(<AnalysisCard item={item} />);

    expect(html).toContain("Estimación del modelo (sin cuotas)");
    expect(html).toContain("Confianza baja");
    expect(html).toContain(
      "En pruebas, el mercado superó a este modelo en todas las ligas",
    );
    expect(html).not.toContain("Comparador de cuotas justas");
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

    expect(html).toContain("Sin probabilidades");
    expect(html).toContain("Sin datos suficientes");
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
      <AnalysisDetailView detail={buildDetail()} />,
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
  });
});

describe("panel de precisión del modelo", () => {
  it("muestra N, periodo y baselines de cierre, pre-cierre e ingenua", () => {
    const html = renderToStaticMarkup(
      <ModelAccuracyPanel accuracy={accuracyFixture} />,
    );

    expect(html).toContain("Precisión del modelo");
    expect(html).toContain("3485");
    expect(html).toContain("2025");
    expect(html).toContain("Mercado cierre");
    expect(html).toContain("El mercado ganó en 3 de 3 ligas");
    expect(html).toContain("Pre-cierre");
    expect(html).toContain("Ingenua");
    expect(html).toContain("por qué cambia N");
  });
});
