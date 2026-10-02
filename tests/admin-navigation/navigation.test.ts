import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import postgres from "postgres";

config({ path: ".env" });

test.beforeEach(async ({ context, page, baseURL }) => {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const databaseUrl = process.env.POSTGRES_URL;
  if (!baseURL || new URL(baseURL).hostname !== "localhost" || !secret || !databaseUrl) {
    throw new Error("Navigation verification requires a local server and local credentials.");
  }
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [account] = await sql`SELECT id, "firstName", "lastName", "dateOfBirth" FROM "User" WHERE role = 'admin' AND "isActive" = true LIMIT 1`;
    if (!account) throw new Error("An active admin is required for read-only verification.");
    const token = { ...account, role: "admin" as const, roleRefreshedAt: Date.now(), dbRefreshedAt: Date.now(), imageVersion: null };
    for (const name of ["authjs.session-token", "__Secure-authjs.session-token"]) {
      const value = await encode({
        secret, salt: name, maxAge: 600, token,
      });
      await context.addCookies([{ name, value, domain: "localhost", path: "/", httpOnly: true, secure: name.startsWith("__Secure"), sameSite: "Lax" }]);
    }
  } finally {
    await sql.end();
  }
  // Prevent browser-driven writes to the shared database during verification.
  await page.route("**/api/activity/heartbeat", route => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/admin/users/mark-viewed", route => route.fulfill({ json: { count: 0 } }));
  await page.route("**/api/admin/users/unviewed-count", route => route.fulfill({ json: { count: 2 } }));
  await page.route("**/api/admin/account-deletion/unviewed-count", route => route.fulfill({ json: { count: 0 } }));
  await page.route("**/api/admin/contact-messages/unread-counts", route => route.fulfill({ json: { contacts: 0, reports: 0 } }));
});

test("prefetches only the loading shell and switches before section data arrives", async ({ page }) => {
  let prefetches = 0;
  let release: (() => void) | undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/admin/pricing?*", async route => {
    if (route.request().headers()["next-router-prefetch"] === "1") {
      const response = await route.fetch();
      const body = await response.text();
      // Real pricing rows/forms must not be fetched for every visible sidebar link.
      expect(body).not.toContain("PricingManagementTable");
      if (body.includes("animate-pulse")) prefetches += 1;
      await route.fulfill({ response });
    } else {
      await held;
      await route.continue();
    }
  });
  await page.goto("/admin/characters");
  await expect(page.getByRole("heading", { name: "Characters", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => prefetches, { timeout: 60_000 }).toBeGreaterThan(0);
  const pricing = page.getByRole("link", { name: "Pricing", exact: true });
  const started = Date.now();
  await pricing.click();
  await expect(page).toHaveURL(/\/admin\/pricing$/, { timeout: 1_000 });
  await expect(page.locator("main [aria-busy=true]")).toBeVisible();
  expect(Date.now() - started).toBeLessThan(1_000);
  console.log(`Prefetched section shell visible after ${Date.now() - started}ms while data is held.`);
  await expect(page.getByRole("button", { name: "Toggle admin sidebar", exact: true })).toBeEnabled();
  await page.screenshot({ path: "tmp/admin-navigation-prefetched-shell.png" });
  release?.();
  await expect(page.getByRole("heading", { name: "Pricing", exact: true })).toBeVisible({ timeout: 60_000 });
});

test("an unready route gets immediate feedback and can be superseded", async ({ page }) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/admin/pricing?*", async route => { await held; await route.continue(); });
  await page.goto("/admin/characters");
  await expect(page.getByRole("heading", { name: "Characters", exact: true })).toBeVisible({ timeout: 60_000 });
  const pricing = page.getByRole("link", { name: "Pricing", exact: true });
  const started = Date.now();
  await pricing.click();
  await expect(pricing.locator("[data-pending=true]")).toBeVisible({ timeout: 1_000 });
  expect(Date.now() - started).toBeLessThan(1_000);
  console.log(`Unready section click feedback visible after ${Date.now() - started}ms.`);
  await expect(page.getByRole("heading", { name: "Characters", exact: true })).toBeVisible();
  await page.screenshot({ path: "tmp/admin-navigation-pending.png" });
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/contacts$/, { timeout: 10_000 });
  await expect(pricing.locator("[data-pending=true]")).toHaveCount(0);
  release?.();
  await expect(page.getByRole("heading", { name: "Contact requests", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/admin\/contacts$/);
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page.locator("[data-pending=true]")).toHaveCount(0);
});

test("admin pages still deny signed-out and regular sessions", async ({ page, context }) => {
  await context.clearCookies();
  const anonymous = await page.request.get("/admin/characters", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  expect(anonymous.headers().location).toBe("/");

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const databaseUrl = process.env.POSTGRES_URL;
  if (!secret || !databaseUrl) throw new Error("Local verification credentials required.");
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [account] = await sql`SELECT id, "firstName", "lastName", "dateOfBirth" FROM "User" WHERE role = 'regular' AND "isActive" = true LIMIT 1`;
    if (!account) throw new Error("Regular account required for authorization verification.");
    const token = { ...account, role: "regular" as const, roleRefreshedAt: Date.now(), dbRefreshedAt: Date.now(), imageVersion: null };
    for (const name of ["authjs.session-token", "__Secure-authjs.session-token"]) {
      const value = await encode({ secret, salt: name, maxAge: 600, token });
      await context.addCookies([{ name, value, domain: "localhost", path: "/", httpOnly: true, secure: name.startsWith("__Secure"), sameSite: "Lax" }]);
    }
  } finally {
    await sql.end();
  }
  const regular = await page.request.get("/admin/characters", { maxRedirects: 0 });
  expect(regular.status()).toBe(307);
  expect(regular.headers().location).toBe("/");
});

test("Settings renders its confirmed sections without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Maintenance", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Feature settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Language settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle admin sidebar", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
