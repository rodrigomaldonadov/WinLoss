/**
 * E2E móvil del buscador y detalle de /analysis/historial.
 *
 * Requiere:
 *   - `npm run dev` en http://localhost:3000
 *   - base de datos accesible con DATABASE_URL
 *
 * Uso: node scripts/e2e-analysis-history.mjs
 *
 * Crea fixtures aislados (competición ZZ9, equipos "E2E ...") con 220 partidos
 * de entrenamiento para que la reconstrucción tenga ratings. Todo se borra al
 * terminar, incluidas las cachés de la revisión.
 */
import { mkdir } from "node:fs/promises";

import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const email = `analysis-history-e2e-${Date.now()}@winloss.test`;
const password = "Test12345!";
const competition = "Liga E2E";
const competitionCode = "ZZ9";

const TEAM_NAMES = [
  "E2E Alpha",
  "E2E Beta",
  "E2E Gamma",
  "E2E Delta",
  "E2E Epsilon",
  "E2E Zeta",
  "E2E Eta",
  "E2E Theta",
];

function normalizeName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function noonUtc(daysAgo) {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysAgo,
      12,
    ),
  );
}

function matchKey(homeName, awayName, playedAt) {
  return `${normalizeName(homeName)}|${normalizeName(awayName)}|${playedAt
    .toISOString()
    .slice(0, 10)}`;
}

function seasonFor(date) {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() + 1 >= 7 ? year : year - 1;
  return { seasonStart: start, season: `${start}/${String(start + 1).slice(-2)}` };
}

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

let userId = null;
let betId = null;
const matchIds = [];

function assertNoHorizontalScroll(label) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  })).then(({ scrollWidth, innerWidth }) => {
    if (scrollWidth > innerWidth + 1) {
      throw new Error(
        `${label}: scroll horizontal (${scrollWidth} > ${innerWidth})`,
      );
    }
  });
}

try {
  await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle" });
  await page.getByLabel("Nombre").fill("Historial E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByLabel("Repite la contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 30_000 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("No se creó el usuario E2E");
  userId = user.id;
  const bankroll = await prisma.bankroll.create({
    data: { userId: user.id, name: "Bankroll E2E", initialAmount: 100 },
  });

  const teams = [];
  for (const name of TEAM_NAMES) {
    teams.push(
      await prisma.team.create({
        data: { canonicalName: name, normalizedName: normalizeName(name) },
      }),
    );
  }

  // 220 partidos de entrenamiento anteriores a la semana del objetivo.
  const base = Date.UTC(2025, 7, 1, 12);
  const training = [];
  for (let index = 0; index < 220; index += 1) {
    const home = teams[index % teams.length];
    const away = teams[(index * 3 + 1) % teams.length];
    if (home.id === away.id) continue;
    const playedAt = new Date(base + index * 86_400_000);
    training.push({
      source: "e2e",
      competition,
      competitionCode,
      ...seasonFor(playedAt),
      playedAt,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeGoals: index % 3,
      awayGoals: (index * 2) % 3,
      result: index % 3 > (index * 2) % 3 ? "H" : index % 3 === (index * 2) % 3 ? "D" : "A",
      dedupeKey: `e2e-history-training-${index}`,
      provisional: false,
    });
  }
  await prisma.historicalMatch.createMany({ data: training });

  const savedDate = noonUtc(2);
  const savedHome = teams[0];
  const savedAway = teams[1];
  const saved = await prisma.historicalMatch.create({
    data: {
      source: "e2e",
      competition,
      competitionCode,
      ...seasonFor(savedDate),
      playedAt: savedDate,
      homeTeamId: savedHome.id,
      awayTeamId: savedAway.id,
      homeGoals: 2,
      awayGoals: 1,
      result: "H",
      provisional: false,
    },
  });
  matchIds.push(saved.id);

  const reconstructedDate = noonUtc(9);
  const reconstructedHome = teams[2];
  const reconstructedAway = teams[3];
  const reconstructed = await prisma.historicalMatch.create({
    data: {
      source: "e2e",
      competition,
      competitionCode,
      ...seasonFor(reconstructedDate),
      playedAt: reconstructedDate,
      homeTeamId: reconstructedHome.id,
      awayTeamId: reconstructedAway.id,
      homeGoals: 0,
      awayGoals: 0,
      result: "D",
      provisional: false,
    },
  });
  matchIds.push(reconstructed.id);

  const market = { home: 0.52, draw: 0.27, away: 0.21 };
  const model = { home: 0.5, draw: 0.28, away: 0.22 };
  await prisma.analysisSnapshot.create({
    data: {
      matchKey: matchKey(savedHome.canonicalName, savedAway.canonicalName, savedDate),
      externalEventId: "e2e-history-saved",
      competition,
      competitionCode,
      kickoff: savedDate,
      snapshotAt: new Date(savedDate.getTime() - 2 * 60 * 60 * 1000),
      homeName: savedHome.canonicalName,
      awayName: savedAway.canonicalName,
      homeTeamId: savedHome.id,
      awayTeamId: savedAway.id,
      confidence: "HIGH",
      finalSource: "market",
      marketProbability: market,
      modelProbability: model,
      finalProbability: market,
      markets: {
        home: model.home,
        draw: model.draw,
        away: model.away,
        over15: 0.72,
        over25: 0.55,
        over35: 0.28,
        btts: 0.6,
      },
      topScores: [
        { home: 2, away: 1, probability: 0.12 },
        { home: 1, away: 0, probability: 0.11 },
        { home: 1, away: 1, probability: 0.1 },
        { home: 2, away: 0, probability: 0.09 },
        { home: 0, away: 1, probability: 0.08 },
      ],
      communityAvailable: false,
      communitySample: null,
      communityProbability: null,
      ratingsVersion: "e2e:2025-12-01T00:00:00.000Z",
      marketCapturedAt: new Date(savedDate.getTime() - 3 * 60 * 60 * 1000),
      marketFresh: true,
    },
  });

  const bet = await prisma.bet.create({
    data: {
      userId: user.id,
      bankrollId: bankroll.id,
      sport: "Fútbol",
      competition,
      eventName: `${savedHome.canonicalName} vs ${savedAway.canonicalName}`,
      market: "Resultado final (1X2)",
      selection: "Local",
      odds: 2.0,
      stake: 10,
      status: "WON",
      betType: "SINGLE",
      payout: 20,
      profit: 10,
      settledAt: new Date(),
      legs: {
        create: {
          position: 0,
          sport: "Fútbol",
          competition,
          eventName: `${savedHome.canonicalName} vs ${savedAway.canonicalName}`,
          eventDate: savedDate,
          odds: 2.0,
          status: "WON",
          externalProvider: "e2e",
          externalEventId: "e2e-history-saved",
          homeTeam: savedHome.canonicalName,
          awayTeam: savedAway.canonicalName,
          scoreHome: 2,
          scoreAway: 1,
          selections: {
            create: {
              position: 0,
              market: "Resultado final (1X2)",
              marketKey: "MATCH_RESULT",
              selection: "Local",
              pick: "HOME",
              line: null,
            },
          },
        },
      },
    },
  });
  betId = bet.id;

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });

    // 1. Buscar equipo con autocompletado.
    await page.goto(`${BASE_URL}/analysis/historial`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("heading", { name: "Historial" }).waitFor();
    const input = page.getByLabel("Buscar por equipo");
    await input.fill("E2E Alpha");
    const option = page.getByRole("option", { name: "E2E Alpha" }).first();
    await option.waitFor({ timeout: 15_000 });
    await option.click();
    await page.waitForURL(/q=E2E\+Alpha|q=E2E%20Alpha/, { timeout: 15_000 });

    const savedRow = page
      .locator("article")
      .filter({ hasText: "E2E Alpha" })
      .filter({ hasText: "E2E Beta" })
      .first();
    await savedRow.waitFor({ timeout: 15_000 });
    await savedRow.getByText("Guardada", { exact: true }).waitFor();
    await assertNoHorizontalScroll(`historial ${width}`);
    await page.screenshot({
      path: `artifacts/e2e-history-${width}.png`,
      fullPage: true,
    });

    // 2. Detalle con captura guardada.
    await savedRow.click({ position: { x: 12, y: 12 } });
    await page.waitForURL(/\/analysis\/historial\/[^/]+$/, { timeout: 15_000 });
    await page
      .getByText("Predicción guardada antes del partido")
      .waitFor();
    await page.getByRole("heading", { name: "Por mercado" }).waitFor();
    await page.getByText("Lo que ocurrió", { exact: false }).first().waitFor();
    await page.getByRole("heading", { name: "Marcadores más probables" }).waitFor();
    await page.getByText("Un solo partido no permite concluir").waitFor();
    await assertNoHorizontalScroll(`detalle ${width}`);
    await page.screenshot({
      path: `artifacts/e2e-history-detail-${width}.png`,
      fullPage: true,
    });

    // 3. Detalle reconstruido (sin snapshot).
    await page.goto(`${BASE_URL}/analysis/historial?q=E2E+Gamma`, {
      waitUntil: "networkidle",
    });
    const reconstructedRow = page
      .locator("article")
      .filter({ hasText: "E2E Gamma" })
      .first();
    await reconstructedRow.getByText("Reconstruida", { exact: true }).waitFor();
    await reconstructedRow.click({ position: { x: 12, y: 12 } });
    await page
      .getByText("Reconstrucción retrospectiva", { exact: true })
      .waitFor({ timeout: 15_000 });
    await page
      .getByText("Es una aproximación, no la predicción que se mostró")
      .waitFor({ timeout: 60_000 });
    await page.getByRole("heading", { name: "Por mercado" }).waitFor();
    await assertNoHorizontalScroll(`detalle reconstruido ${width}`);
    await page.screenshot({
      path: `artifacts/e2e-history-reconstructed-${width}.png`,
      fullPage: true,
    });

    // 4. Desde la apuesta liquidada.
    await page.goto(`${BASE_URL}/bets`, { waitUntil: "networkidle" });
    const card = page
      .locator("article")
      .filter({ hasText: savedHome.canonicalName })
      .first();
    await card.waitFor({ timeout: 15_000 });
    await card
      .getByRole("link", { name: "Ver análisis del partido" })
      .click();
    await page.waitForURL(/\/analysis\/historial\/[^/]+$/, { timeout: 15_000 });
    await page.getByRole("heading", { name: "Por mercado" }).waitFor();
    await page.screenshot({
      path: `artifacts/e2e-history-from-bet-${width}.png`,
      fullPage: true,
    });

    // 5. Últimos resultados en Próximos.
    await page.goto(`${BASE_URL}/analysis`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Últimos resultados" }).waitFor();
    await assertNoHorizontalScroll(`próximos ${width}`);
  }

  console.log("✅ E2E de /analysis/historial OK");
  if (errors.length > 0) {
    console.log("⚠️ Errores de consola:");
    for (const error of errors) console.log("   -", error);
    process.exitCode = 1;
  }
} catch (error) {
  await page
    .screenshot({ path: "artifacts/e2e-history-error.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close().catch(() => {});
  try {
    if (betId) {
      await prisma.bet.deleteMany({ where: { id: betId } });
    }
    if (matchIds.length > 0) {
      await prisma.matchReviewCache.deleteMany({
        where: { historicalMatchId: { in: matchIds } },
      });
    }
    await prisma.ratingAsOfCache.deleteMany({
      where: { competitionCode },
    });
    await prisma.analysisSnapshot.deleteMany({
      where: { externalEventId: { startsWith: "e2e-history-" } },
    });
    await prisma.historicalMatch.deleteMany({ where: { source: "e2e" } });
    await prisma.team.deleteMany({
      where: { normalizedName: { startsWith: "e2e " } },
    });
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  } catch (cleanupError) {
    console.log("⚠️ No se pudo limpiar el fixture E2E:", cleanupError.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
