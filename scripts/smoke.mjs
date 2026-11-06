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
  await page.getByLabel("Deporte").fill("Fútbol");
  await page.getByLabel("Competición").fill("Liga 1");
  await page.getByLabel("Evento").fill("Alianza Lima vs. Universitario");
  await page.getByLabel("Mercado").fill("Ganador del partido");
  await page.getByLabel("Selección").fill("Alianza Lima");
  await page.getByLabel("Cuota").fill("2.00");
  await page.getByLabel("Stake").fill("10.00");
  await page.getByText("Retorno potencial").waitFor({ timeout: 10_000 });
  await page.screenshot({
    path: "artifacts/06-bet-form-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Registrar apuesta" }).click();

  await page.waitForURL(`${BASE_URL}/bets`, { timeout: 30_000 });
  await page.getByRole("heading", { name: "Apuestas" }).waitFor();
  await page.getByText("Alianza Lima vs. Universitario").waitFor({
    timeout: 15_000,
  });

  // Liquidación como ganada
  await page.getByRole("button", { name: "Liquidar" }).click();
  await page
    .getByRole("button", { name: "Ganada", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar resultado" }).click();

  const betArticle = page
    .locator("article")
    .filter({ hasText: "Alianza Lima vs. Universitario" });
  await betArticle.getByText("Ganada", { exact: true }).waitFor({
    timeout: 15_000,
  });
  const betText = await betArticle.innerText();
  if (!betText.includes("10.00")) {
    throw new Error(`Beneficio no visible tras liquidar: ${betText}`);
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
  await page.screenshot({
    path: "artifacts/08-dashboard-data-mobile.png",
    fullPage: false,
  });

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
