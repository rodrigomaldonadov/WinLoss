/**
 * E2E móvil de /analysis con un fixture de cuotas aislado.
 *
 * Requiere:
 *   - `npm run dev` en http://localhost:3000
 *   - base de datos accesible con DATABASE_URL
 *
 * Uso: node scripts/e2e-analysis.mjs
 *
 * El partido, el lote y el usuario se borran al terminar. No escribe datos de
 * producción permanentes.
 */
import { mkdir } from "node:fs/promises";

import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const email = `analysis-e2e-${Date.now()}@winloss.test`;
const password = "Test12345!";
const now = new Date();
const kickoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const caveat =
  "En pruebas, el mercado superó a este modelo en todas las ligas";

const market = { home: 0.5, draw: 0.25, away: 0.25 };
const model = { home: 0.45, draw: 0.3, away: 0.25 };

await mkdir("artifacts", { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "es-PE",
  timezoneId: "America/Lima",
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

let analysisId = null;
let batchId = null;

try {
  await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle" });
  await page.getByLabel("Nombre").fill("Analysis E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByLabel("Repite la contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 30_000 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("No se creó el usuario E2E");
  await prisma.bankroll.create({
    data: { userId: user.id, name: "Bankroll E2E", initialAmount: 100 },
  });

  const batch = await prisma.fixtureBatch.create({
    data: {
      source: "football-data.co.uk:fixtures",
      sourceFile: "e2e-fixtures.csv",
      capturedAt: now,
      rowCount: 0,
      metadata: { e2e: true },
    },
    select: { id: true },
  });
  batchId = batch.id;

  const analysis = await prisma.matchAnalysis.create({
    data: {
      source: "analysis-engine",
      externalEventId: `e2e-market-${Date.now()}`,
      competition: "Premier League",
      competitionCode: "E0",
      homeName: "Arsenal E2E",
      awayName: "Chelsea E2E",
      kickoff,
      confidence: "HIGH",
      probabilities: {
        available: true,
        source: "market",
        home: market.home,
        draw: market.draw,
        away: market.away,
        over25: 0.55,
        under25: 0.45,
        weight: 0,
        temperature: 1,
        note: "Mercado como fuente principal",
      },
      metadata: {
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
            note: caveat,
          },
          community: {
            key: "community",
            label: "Comunidad",
            available: false,
            confidence: "INSUFFICIENT",
            probabilities: null,
            totals: null,
            sample: 0,
            note: "Muestra insuficiente (0 usuarios; mínimo 5)",
          },
          private: {
            key: "private",
            label: "Tu historial",
            available: false,
            confidence: "INSUFFICIENT",
            probabilities: null,
            totals: null,
            sample: null,
            note: "Sin historial propio para este partido",
          },
        },
        reference: {
          hasMarketBacktest: true,
          sample: 470,
          modelBrier: 0.6247,
          marketBrier: 0.6084,
          marketPreBrier: 0.6102,
          naiveBrier: 0.6577,
          asOf: now.toISOString(),
        },
        notes: [caveat],
        modelSample: 400,
        marketCapturedAt: now.toISOString(),
        marketFresh: true,
        fixtureId: "e2e-fixture",
        fixtureIds: ["e2e-fixture"],
        sourcesUsed: ["e2e:fixtures"],
        generatedAt: now.toISOString(),
      },
    },
    select: { id: true },
  });
  analysisId = analysis.id;

  // 1. Tablero: pestañas, ayuda en hoja y tarjeta compacta.
  await page.goto(`${BASE_URL}/analysis`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Consenso" }).waitFor();
  await page.getByRole("link", { name: "Próximos" }).waitFor();
  await page.getByRole("link", { name: "Historial" }).waitFor();
  await page.getByRole("link", { name: "Precisión" }).waitFor();
  await page
    .getByRole("button", { name: "Cómo leer esta pantalla" })
    .click();
  await page.getByText("Cómo leer esta pantalla").last().waitFor();
  await page.keyboard.press("Escape");

  const card = page
    .locator("article")
    .filter({ hasText: "Arsenal E2E" })
    .first();
  await card.waitFor();
  await card
    .getByText("Probabilidad del mercado (sin margen)")
    .waitFor();
  await card.getByText("50%").first().waitFor();
  await card.getByText("BTTS").waitFor();
  await page.screenshot({ path: "artifacts/e2e-analysis-board.png" });

  // 2. Detalle desde la tarjeta completa (clic en la cabecera, no en un chip).
  await card.click({ position: { x: 12, y: 12 } });
  await page.waitForURL(/\/analysis\/[^/]+$/, { timeout: 15_000 });
  for (const heading of ["Probabilidades", "Fuentes", "Calidad de datos"]) {
    await page.getByRole("heading", { name: heading }).waitFor();
  }
  await page.getByText("Forma reciente y H2H").waitFor();
  await page.getByText("Tu historial", { exact: true }).waitFor();
  await page.getByText("Estado de los datos").waitFor();
  await page.getByText("Comparador de cuotas justas").waitFor();
  await page.getByLabel(/Cuota de tu casa/).fill("2,10");
  await page
    .getByText("5% mejor que la cuota justa del mercado.")
    .waitFor();
  await page.screenshot({ path: "artifacts/e2e-analysis-detail.png" });

  // 3. Chip BTTS del detalle → formulario precargado.
  await page
    .getByRole("link", {
      name: "Precargar ambos marcan Sí en una nueva apuesta",
    })
    .click();
  await page.waitForURL(/\/bets\/new\?/, { timeout: 15_000 });
  await page.getByText("Precargado desde Consenso").waitFor();
  await page.getByText("Se guardará: Ambos equipos marcan · Sí").waitFor();
  await page
    .getByRole("button", { name: "Ambos anotan", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Sí", exact: true }).waitFor();
  await page.screenshot({ path: "artifacts/e2e-analysis-form-btts.png" });

  // 4. Chip Más de 2.5 del tablero → formulario con línea.
  await page.goto(`${BASE_URL}/analysis`, { waitUntil: "networkidle" });
  const cardAgain = page
    .locator("article")
    .filter({ hasText: "Arsenal E2E" })
    .first();
  await cardAgain
    .getByRole("link", {
      name: "Precargar +2.5 en una nueva apuesta",
    })
    .click();
  await page.waitForURL(/\/bets\/new\?/, { timeout: 15_000 });
  await page.getByText("Se guardará: Total de goles · Más de 2.5").waitFor();

  // 5. Chip 1X2 del tablero → formulario con mercado y selección, sin cuota.
  await page.goto(`${BASE_URL}/analysis`, { waitUntil: "networkidle" });
  const cardThird = page
    .locator("article")
    .filter({ hasText: "Arsenal E2E" })
    .first();
  await cardThird
    .getByRole("link", {
      name: "Precargar Local en una nueva apuesta",
    })
    .click();
  await page.waitForURL(/\/bets\/new\?/, { timeout: 15_000 });
  await page.getByText("Se guardará: Resultado final (1X2) · Local").waitFor();
  if (
    (await page
      .getByRole("button", { name: "1X2", exact: true })
      .getAttribute("aria-pressed")) !== "true"
  ) {
    throw new Error("El mercado 1X2 no quedó seleccionado");
  }
  if (
    (await page
      .getByRole("button", { name: "Local", exact: true })
      .first()
      .getAttribute("aria-pressed")) !== "true"
  ) {
    throw new Error("La selección Local no quedó seleccionada");
  }
  if ((await page.getByLabel("Cuota del partido").inputValue()) !== "") {
    throw new Error("La precarga no debe rellenar la cuota");
  }

  console.log("✅ E2E de /analysis OK");
  if (errors.length > 0) {
    console.log("⚠️ Errores de consola:");
    for (const error of errors) console.log("   -", error);
    process.exitCode = 1;
  }
} catch (error) {
  await page
    .screenshot({ path: "artifacts/e2e-analysis-error.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  if (analysisId) {
    await prisma.matchAnalysis.deleteMany({ where: { id: analysisId } });
  }
  if (batchId) {
    await prisma.fixtureBatch.deleteMany({ where: { id: batchId } });
  }
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
}
