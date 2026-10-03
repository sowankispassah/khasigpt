import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
};

const baseUrl =
  process.env.BASE_URL ?? getArg("--base-url") ?? "http://172.20.128.1:3000";
const userDataDir =
  process.env.USER_DATA_DIR ?? getArg("--user-data-dir") ?? "tmp/lh-auth-profile";
const email = process.env.LH_EMAIL ?? getArg("--email");
const password = process.env.LH_PASSWORD ?? getArg("--password");

if (!email || !password) {
  console.error("Missing LH_EMAIL or LH_PASSWORD env vars.");
  process.exit(1);
}

await mkdir(userDataDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
});
const page = await context.newPage();

await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });

const emailInput = page.locator('input[name="email"]');
const continueButton = page.getByRole("button", {
  name: /continue with email/i,
});

const revealed = await Promise.race([
  emailInput
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => "email"),
  continueButton
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => "button"),
]);

if (revealed === "button") {
  await continueButton.click();
  await emailInput.waitFor({ state: "visible", timeout: 20000 });
}
await emailInput.fill(email);
await page.fill('input[name="password"]', password);

await page.click('button[type="submit"]');

try {
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30000,
  });
} catch {
  const message = await page
    .locator('div[role="alert"]')
    .first()
    .textContent()
    .catch(() => null);
  throw new Error(
    `Login failed or timed out. ${message ? `Message: ${message}` : ""}`.trim()
  );
}

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.waitForSelector('textarea[name="message"]', { timeout: 30000 });
await page.fill('textarea[name="message"]', "Lighthouse auth check");
await page.keyboard.press("Enter");
await page.waitForURL(/\/chat\/.+/, { timeout: 30000 });

console.log(`CHAT_URL=${page.url()}`);

await context.close();
