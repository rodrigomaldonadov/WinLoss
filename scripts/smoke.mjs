/**
 * Smoke test E2E (registro → bankroll → casa → apuesta → liquidación).
 * Uso: node scripts/smoke.mjs
 * Requiere el servidor de desarrollo en http://localhost:3000.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const email = `smoke-${Date.now()}@winloss.test`;
const password = "Test12345!";

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

/** Selecciona un deporte en el combobox del leg `index`. */
async function selectSport(index, sport) {
  await page.getByLabel("Deporte", { exact: true }).nth(index).click();
  await page.getByRole("option", { name: sport, exact: true }).click();
}

/** Selecciona una competición del catálogo (con búsqueda). */
async function selectCompetition(index, query, label) {
  await page.getByLabel("Competición", { exact: true }).nth(index).click();
  await page.getByLabel("Buscar competición").last().fill(query);
  await page.getByRole("button", { name: label, exact: true }).last().click();
}

try {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: "artifacts/01-login-mobile.png", fullPage: true });

  await page.getByRole("link", { name: "Crear cuenta" }).click();
  await page.waitForURL("**/register");

  await page.getByLabel("Nombre").fill("Usuario Smoke");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByLabel("Repite la contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await page.waitForURL(`${BASE_URL}/`, { timeout: 30_000 });
  await page.getByRole("heading", { name: "Resumen" }).waitFor();
  await page.screenshot({
    path: "artifacts/02-dashboard-empty-mobile.png",
    fullPage: false,
  });

  await page.goto(`${BASE_URL}/bankroll`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Crear mi bankroll" }).click();
  await page.getByLabel("Nombre").fill("Bankroll principal");
  await page.getByLabel("Capital inicial").fill("500,50");
  await page.getByRole("button", { name: "Crear bankroll" }).click();

  await page.getByRole("heading", { name: "Bankroll principal" }).waitFor({
    timeout: 15_000,
  });
  await page.screenshot({
    path: "artifacts/03-bankroll-mobile.png",
    fullPage: false,
  });

  const bankrollText = await page.locator("article").first().innerText();
  if (!bankrollText.includes("500.50") && !bankrollText.includes("500,50")) {
    throw new Error(`Saldo inicial no visible: ${bankrollText}`);
  }

  // Edición
  await page.getByRole("button", { name: "Editar Bankroll principal" }).click();
  await page.locator("#bankroll-name").fill("Bankroll editado");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page
    .getByRole("heading", { name: "Bankroll editado" })
    .waitFor({ timeout: 15_000 });

  // Casa de apuestas
  await page.goto(`${BASE_URL}/settings/bookmakers`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "Añadir la primera" }).click();
  await page.getByLabel("Nombre").fill("Betsson");
  await page.getByRole("button", { name: "Añadir casa" }).click();
  await page.getByText("Betsson").first().waitFor({ timeout: 15_000 });
  await page.screenshot({
    path: "artifacts/05-bookmakers-mobile.png",
    fullPage: false,
  });

  // Nueva apuesta con cálculo en vivo
  await page.goto(`${BASE_URL}/bets/new`, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Casa de apuestas" }).click();
  await page.getByRole("option", { name: "Betsson" }).click();
  await selectSport(0, "Fútbol");
  await selectCompetition(0, "Liga 1", "Liga 1");
  await page.getByLabel("Evento", { exact: true }).fill("Alianza Lima vs. Universitario");
  await page.getByLabel("Mercado manual", { exact: true }).fill("Ganador del partido");
  await page.getByLabel("Selección manual", { exact: true }).fill("Alianza Lima");
  await page.getByLabel("Cuota del partido").fill("2.00");
  await page.getByLabel("Stake").fill("10.00");
  await page.getByText("Retorno", { exact: true }).waitFor({ timeout: 10_000 });
  await page.screenshot({
    path: "artifacts/06-bet-form-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  await page.waitForURL(/\/bets(?:\?|$)/, { timeout: 30_000 });
  await page.getByRole("heading", { name: "Apuestas" }).waitFor();
  await page.getByText("Alianza Lima vs. Universitario").waitFor({
    timeout: 15_000,
  });

  // Liquidación como ganada
  await page.getByRole("button", { name: "Liquidar" }).click();
  await page.getByRole("button", { name: "Todo ganado" }).click();
  await page.locator("#settle-closing-0").fill("1.85");
  await page.getByRole("button", { name: "Confirmar resultado" }).click();

  const betArticle = page
    .locator("article")
    .filter({ hasText: "Alianza Lima vs. Universitario" });
  await betArticle.getByText("CLV", { exact: true }).first().waitFor({
    timeout: 15_000,
  });
  const betText = await betArticle.innerText();
  if (!betText.includes("10.00")) {
    throw new Error(`Beneficio no visible tras liquidar: ${betText}`);
  }
  if (!betText.includes("8.1")) {
    throw new Error(`CLV esperado 8.1% no visible: ${betText}`);
  }
  await page.screenshot({
    path: "artifacts/07-bets-mobile.png",
    fullPage: false,
  });

  // Dashboard con métricas reales
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  const dashboardText = await page.locator("body").innerText();
  if (
    !dashboardText.includes("510.50") &&
    !dashboardText.includes("510,50")
  ) {
    throw new Error(`Bankroll actual no recalculado: ${dashboardText}`);
  }
  if (!dashboardText.includes("+8.1%")) {
    throw new Error(`CLV del dashboard incorrecto: ${dashboardText}`);
  }
  await page
    .locator('section:has(h2:text("Análisis")) svg.recharts-surface')
    .first()
    .waitFor({ timeout: 15_000 });
  await page.screenshot({
    path: "artifacts/08-dashboard-data-mobile.png",
    fullPage: false,
  });

  // Duplicar apuesta: mismo pick, stake vacío
  await page.goto(`${BASE_URL}/bets`, { waitUntil: "networkidle" });
  await page
    .locator("article")
    .filter({ hasText: "Alianza Lima vs. Universitario" })
    .getByRole("button", { name: /Opciones de/ })
    .click();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "artifacts/11-bet-options-mobile.png",
    fullPage: false,
  });
  await page.getByRole("link", { name: /Duplicar/ }).click();
  await page.waitForURL(/\/bets\/new\?copy=/, { timeout: 15_000 });

  if (!(await page.getByLabel("Evento", { exact: true }).inputValue()).includes("Alianza")) {
    throw new Error("Duplicar no prellenó el evento");
  }
  if ((await page.getByLabel("Stake").inputValue()) !== "") {
    throw new Error("Duplicar no debe copiar el stake");
  }

  await page.getByLabel("Stake").fill("20");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.waitForURL(/\/bets(?:\?|$)/, { timeout: 30_000 });
  await page.getByText("2 apuestas registradas").waitFor({ timeout: 15_000 });

  // Editar apuesta pendiente
  await page
    .locator("article")
    .filter({ hasText: "Pendiente" })
    .getByRole("button", { name: /Opciones de/ })
    .click();
  await page.getByRole("link", { name: /Editar/ }).click();
  await page.waitForURL(/\/bets\/.+\/edit/, { timeout: 15_000 });
  await page.getByLabel("Stake").fill("30");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.waitForURL(/\/bets(?:\?|$)/, { timeout: 30_000 });

  const editedPending = await page
    .locator("article")
    .filter({ hasText: "Pendiente" })
    .innerText();
  if (!editedPending.includes("30.00")) {
    throw new Error(`Stake editado no visible: ${editedPending}`);
  }

  // Eliminar apuesta pendiente
  await page
    .locator("article")
    .filter({ hasText: "Pendiente" })
    .getByRole("button", { name: /Opciones de/ })
    .click();
  await page
    .getByRole("button", { name: /Eliminar\s+Libera el stake/ })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Eliminar", exact: true })
    .click();
  await page.getByText("1 apuesta registrada").waitFor({ timeout: 15_000 });

  // Editar una apuesta YA liquidada: debe recalcular payout, profit y ROI
  await page
    .locator("article")
    .filter({ hasText: "Ganada" })
    .getByRole("button", { name: /Opciones de/ })
    .click();
  await page.getByRole("link", { name: /Editar/ }).click();
  await page.waitForURL(/\/bets\/.+\/edit/, { timeout: 15_000 });
  await page.screenshot({
    path: "artifacts/12-edit-bet-mobile.png",
    fullPage: false,
  });
  await page.getByLabel("Stake").fill("20");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.waitForURL(/\/bets(?:\?|$)/, { timeout: 30_000 });

  const settledText = await page
    .locator("article")
    .filter({ hasText: "Ganada" })
    .innerText();
  if (!/\+S\/\s?20[.,]00/.test(settledText)) {
    throw new Error(`Settled no recalculado: ${settledText}`);
  }

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  const recalculated = await page.locator("body").innerText();
  if (
    !recalculated.includes("520.50") &&
    !recalculated.includes("520,50")
  ) {
    throw new Error(`Bankroll no recalculado al editar: ${recalculated}`);
  }

  // Eliminar la liquidada devuelve el bankroll a su capital inicial
  await page.goto(`${BASE_URL}/bets`, { waitUntil: "networkidle" });
  await page
    .locator("article")
    .filter({ hasText: "Ganada" })
    .getByRole("button", { name: /Opciones de/ })
    .click();
  await page
    .getByRole("button", { name: /Eliminar\s+Libera el stake/ })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Eliminar", exact: true })
    .click();
  await page
    .getByText("Todavía no hay apuestas")
    .waitFor({ timeout: 15_000 });

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  const restored = await page.locator("body").innerText();
  if (!restored.includes("500.50") && !restored.includes("500,50")) {
    throw new Error(`Bankroll no restaurado al borrar: ${restored}`);
  }

  // ── Múltiple: 1.55 x 1.44 con stake 100 → payout 223.20 ──────────────
  await page.goto(`${BASE_URL}/bets/new`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Múltiple" }).click();

  await selectSport(0, "Fútbol");
  await page.getByLabel("Evento", { exact: true }).nth(0).fill("PSG vs. Marsella");
  await page.getByLabel("Mercado manual", { exact: true }).nth(0).fill("Ganador del partido");
  await page.getByLabel("Selección manual", { exact: true }).nth(0).fill("PSG");
  await page.getByLabel("Cuota del partido").nth(0).fill("1.55");

  await page.getByRole("button", { name: "Añadir", exact: true }).click();

  await selectSport(1, "Fútbol");
  await page.getByLabel("Evento", { exact: true }).nth(1).fill("Real Madrid vs. Barcelona");
  await page.getByLabel("Mercado manual", { exact: true }).nth(1).fill("Ambos equipos marcan");
  await page.getByLabel("Selección manual", { exact: true }).nth(1).fill("Sí");
  await page.getByLabel("Cuota del partido").nth(1).fill("1.44");

  const totalOdds = await page.getByLabel("Cuota total").inputValue();
  if (totalOdds !== "2.232") {
    throw new Error(`Cuota total del múltiple incorrecta: ${totalOdds}`);
  }

  await page.getByLabel("Stake").fill("100");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.waitForURL(/\/bets(?:\?|$)/, { timeout: 30_000 });

  const multipleArticle = page
    .locator("article")
    .filter({ hasText: "PSG vs. Marsella" })
    .filter({ hasText: "Múltiple (2)" });
  await multipleArticle.waitFor({ timeout: 15_000 });
  const multiplePendingText = await multipleArticle.innerText();
  if (!multiplePendingText.includes("223.20")) {
    throw new Error(`Retorno del múltiple incorrecto: ${multiplePendingText}`);
  }

  await multipleArticle.getByRole("button", { name: "Liquidar" }).click();
  await page.getByRole("button", { name: "Todo ganado" }).click();
  await page.locator("#settle-closing-0").fill("1.80");
  await page.locator("#settle-closing-1").fill("1.50");
  await page.getByRole("button", { name: "Confirmar resultado" }).click();

  await multipleArticle.locator('[data-slot="badge"]').filter({ hasText: "Ganada" }).first().waitFor({
    timeout: 15_000,
  });
  const multipleSettledText = await multipleArticle.innerText();
  if (!/\+S\/\s?123[.,]20/.test(multipleSettledText)) {
    throw new Error(`Beneficio del múltiple incorrecto: ${multipleSettledText}`);
  }

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  const afterMultiple = await page.locator("body").innerText();
  if (!afterMultiple.includes("623.70") && !afterMultiple.includes("623,70")) {
    throw new Error(`Bankroll tras múltiple incorrecto: ${afterMultiple}`);
  }

  // ── Bet Builder: cuota manual 3.00 con stake 100 → payout 300.00 ──────
  await page.goto(`${BASE_URL}/bets/new`, { waitUntil: "networkidle" });
  await selectSport(0, "Fútbol");
  await page.getByLabel("Evento", { exact: true }).nth(0).fill("PSG vs. Marsella");
  await page.getByRole("switch", { name: "Bet Builder" }).click();

  await page.getByLabel("Mercado manual", { exact: true }).nth(0).fill("Total de goles");
  await page.getByLabel("Selección manual", { exact: true }).nth(0).fill("Más de 5.5 goles");
  await page.getByLabel("Mercado manual", { exact: true }).nth(1).fill("Total de córneres");
  await page.getByLabel("Selección manual", { exact: true }).nth(1).fill("Más de 10.5 córneres");
  await page.getByLabel("Cuota del builder").fill("3.00");
  await page.getByLabel("Stake").fill("100");

  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.waitForURL(/\/bets(?:\?|$)/, { timeout: 30_000 });

  const builderArticle = page
    .locator("article")
    .filter({ hasText: "Builder" })
    .filter({ hasText: "PSG vs. Marsella" })
    .filter({ hasText: "Pendiente" });
  await builderArticle.waitFor({ timeout: 15_000 });
  const builderPendingText = await builderArticle.innerText();
  if (!builderPendingText.includes("300.00")) {
    throw new Error(`Retorno del builder incorrecto: ${builderPendingText}`);
  }

  await builderArticle.getByRole("button", { name: "Liquidar" }).click();
  await page.getByRole("button", { name: "Todo ganado" }).click();
  await page.getByRole("button", { name: "Confirmar resultado" }).click();

  const builderSettledArticle = page
    .locator("article")
    .filter({ hasText: "Builder" })
    .filter({ hasText: "PSG vs. Marsella" });
  await builderSettledArticle
    .locator('[data-slot="badge"]')
    .filter({ hasText: "Ganada" })
    .first()
    .waitFor({ timeout: 15_000 });
  const builderSettledText = await builderSettledArticle.innerText();
  if (!/\+S\/\s?200[.,]00/.test(builderSettledText)) {
    throw new Error(`Beneficio del builder incorrecto: ${builderSettledText}`);
  }

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  const afterBuilder = await page.locator("body").innerText();
  if (!afterBuilder.includes("823.70") && !afterBuilder.includes("823,70")) {
    throw new Error(`Bankroll tras builder incorrecto: ${afterBuilder}`);
  }

  // ── Auto-liquidación (proveedor fake) ───────────────────────────────
  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  const dbBankroll = await prisma.bankroll.findFirst({
    where: { userId: dbUser.id },
    select: { id: true },
  });
  await prisma.bet.create({
    data: {
      userId: dbUser.id,
      bankrollId: dbBankroll.id,
      sport: "Fútbol",
      competition: "Liga 1",
      eventName: "Auto Fake vs Test",
      market: "Resultado final (1X2)",
      selection: "Local",
      odds: 2,
      stake: 10,
      status: "PENDING",
      betType: "SINGLE",
      legs: {
        create: [
          {
            position: 0,
            sport: "Fútbol",
            competition: "Liga 1",
            eventName: "Auto Fake vs Test",
            eventDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
            isBuilder: false,
            odds: 2,
            status: "PENDING",
            externalProvider: "fake",
            externalEventId: "fake:match-1",
            homeTeam: "PSG",
            awayTeam: "Marsella",
            selections: {
              create: [
                {
                  position: 0,
                  market: "Resultado final (1X2)",
                  selection: "Local",
                  marketKey: "MATCH_RESULT",
                  pick: "HOME",
                },
              ],
            },
          },
        ],
      },
    },
  });

  await page.goto(`${BASE_URL}/bets`, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Verificar resultados" })
    .first()
    .click();
  await page.getByText("Resultados propuestos").waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Aplicar resultados" }).click();

  const autoArticle = page
    .locator("article")
    .filter({ hasText: "Auto Fake vs Test" });
  await autoArticle
    .locator('[data-slot="badge"]')
    .filter({ hasText: "Ganada" })
    .first()
    .waitFor({ timeout: 20_000 });
  const autoText = await autoArticle.innerText();
  if (!/\+S\/\s?10[.,]00/.test(autoText)) {
    throw new Error(`Auto-liquidación con importe incorrecto: ${autoText}`);
  }
  if (!autoText.includes("2-1") || !autoText.includes("Auto")) {
    throw new Error(`Falta marcador o etiqueta Auto: ${autoText}`);
  }

  // ── Buscador de un día + chips de mercado ───────────────────────────
  await page.goto(`${BASE_URL}/bets/new`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Buscar evento" }).first().click();
  await page.getByRole("heading", { name: "Buscar eventos" }).waitFor({
    timeout: 10_000,
  });
  for (const label of ["Ayer", "Hoy", "Mañana"]) {
    if (!(await page.getByRole("button", { name: label, exact: true }).isVisible())) {
      throw new Error(`Falta el chip de día ${label}`);
    }
  }
  await page.getByRole("button", { name: /Añadir/ }).click();
  await page.getByLabel("Buscar competición").fill("Liga 1");
  await page
    .getByRole("button", { name: "Liga 1", exact: true })
    .last()
    .click();
  await page.waitForTimeout(2_500);
  await page.screenshot({
    path: "artifacts/20-event-search-mobile.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "Ingresar manualmente" }).click();

  await page.getByLabel("Deporte", { exact: true }).click();
  await page.getByRole("option", { name: "Fútbol", exact: true }).click();
  await page.getByRole("button", { name: "Córneres", exact: true }).click();
  await page.getByRole("button", { name: "Menos de", exact: true }).click();
  await page.getByRole("button", { name: "9.5", exact: true }).click();
  await page.getByText(/Menos de 9.5 córneres/).waitFor({ timeout: 5_000 });

  // ── Importar boleto pegado como texto ───────────────────────────────
  await page.goto(`${BASE_URL}/bets/new`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Pegar texto del boleto/ }).click();
  await page.getByLabel("Texto del boleto").fill(`Simple
S/ 100.00
Cuota 1.32

Galatasaray vs Barcelona
Barcelona
1.32
Resultado del partido (1X2)
13/10 • 14:00
Galatasaray
1
Barcelona
4
Cuota total
1.32
Apuesta total
PEN 100.00
Ganancia total
PEN 132.00`);
  await page.getByRole("button", { name: "Analizar" }).click();
  await page
    .getByText("PEN 100.00", { exact: true })
    .waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: /Rellenar formulario/ }).click();
  await page
    .getByText("Boleto importado: 1 partido")
    .waitFor({ timeout: 10_000 });

  const pastedStake = await page.getByLabel("Stake").inputValue();
  const pastedEvent = await page
    .getByLabel("Evento", { exact: true })
    .inputValue();
  if (pastedStake !== "100") {
    throw new Error(`Stake importado incorrecto: ${pastedStake}`);
  }
  if (pastedEvent !== "Galatasaray vs Barcelona") {
    throw new Error(`Evento importado incorrecto: ${pastedEvent}`);
  }
  await page.getByText("S/ 132.00").first().waitFor({ timeout: 5_000 });

  await page.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
  if (!(await page.getByText("Casas de apuestas").isVisible())) {
    throw new Error("Ajustes no enlaza a casas de apuestas");
  }
  await page.screenshot({
    path: "artifacts/09-settings-mobile.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/bets`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: "artifacts/10-bets-desktop.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: /Usuario Smoke/ }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await page.waitForURL("**/login", { timeout: 15_000 });

  console.log("✅ Smoke test OK");
  console.log(`   Usuario: ${email}`);
  if (errors.length > 0) {
    console.log("⚠️ Errores de consola:");
    for (const error of errors) console.log("   -", error);
    process.exitCode = 1;
  }
} catch (error) {
  await page
    .screenshot({ path: "artifacts/error.png", fullPage: true })
    .catch(() => {});
  if (errors.length > 0) {
    console.log("⚠️ Errores de consola:");
    for (const message of errors) console.log("   -", message);
  }
  throw error;
} finally {
  await browser.close();
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
}
