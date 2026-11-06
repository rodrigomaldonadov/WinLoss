/**
 * Smoke test E2E (registro → bankroll → ajustes).
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

  // Borrado
  await page.getByRole("button", { name: "Eliminar Bankroll editado" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Eliminar", exact: true })
    .click();
  await page
    .getByText("Crea tu primer bankroll")
    .waitFor({ timeout: 15_000 });

  await page.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: "artifacts/04-settings-mobile.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/bankroll`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: "artifacts/05-bankroll-desktop.png",
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
} finally {
  await browser.close();
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
}
