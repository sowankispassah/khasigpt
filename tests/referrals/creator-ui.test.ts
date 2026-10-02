import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import postgres from "postgres";

config({ path: ".env" });
const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const databaseUrl = process.env.POSTGRES_URL;
test.skip(!secret || !databaseUrl, "Local auth and read-only database credentials required.");

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL || new URL(baseURL).hostname !== "localhost") throw new Error("Creator UI tests only run against the local test server.");
  if (!databaseUrl || !secret) throw new Error("Missing local verification credentials.");
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [creator] = await sql`select u.id, u."firstName", u."lastName", u."dateOfBirth" from "User" u join "CreatorReferral" r on r."creatorId" = u.id where u.role = 'creator' and u."isActive" = true limit 1`;
    test.skip(!creator, "No assigned active creator available for read-only verification.");
    for (const name of ["authjs.session-token", "__Secure-authjs.session-token"]) {
      const value = await encode({ secret, salt: name, token: { id: creator.id, role: "creator", roleRefreshedAt: Date.now(), dbRefreshedAt: Date.now(), dateOfBirth: creator.dateOfBirth, imageVersion: null, firstName: creator.firstName, lastName: creator.lastName }, maxAge: 600 });
      await context.addCookies([{ name, value, domain: "localhost", path: "/", httpOnly: true, secure: name.startsWith("__Secure"), sameSite: "Lax" }]);
    }
  } finally { await sql.end(); }
});

test("creator endpoint returns assigned links while keeping admin fields private", async ({ page }) => {
  const response = await page.request.get("/api/creator/referrals?creatorId=11111111-1111-4111-8111-111111111111");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const data = await response.json();
  expect(data.available).toBe(true);
  expect(data.referrals.length).toBeGreaterThan(0);
  for (const row of data.referrals) {
    expect(row).not.toHaveProperty("creatorId");
    expect(row).not.toHaveProperty("creatorName");
    expect(row.createdAt).toBeTruthy();
  }
  expect(data).not.toHaveProperty("recentPayouts");
  expect(data).not.toHaveProperty("recentCommissions");
});

test("creator table shows terms and supports sharing, copy and responsive scrolling", async ({ page }) => {
  test.setTimeout(90000);
  const clientErrors: string[] = [];
  page.on("pageerror", error => clientErrors.push(error.message));
  await page.addInitScript(() => {
    const shares: ShareData[] = [];
    Object.assign(window, { referralShares: shares });
    Object.defineProperty(navigator, "share", { value: async (payload: ShareData) => { shares.push(payload); } });
  });
  await page.route("**/api/creator/referrals?*", route => route.fulfill({ json: {
    available: true, earningEnabled: true, page: 1, totalCount: 1,
    referrals: [{ id: "testlink", code: "creator123", percentage: 5, duration: "months", months: 3, windowDays: null, rechargeBefore: null, createdAt: "2026-10-01T00:00:00Z", isActive: true, signups: 4, balances: [{ currency: "INR", earned: 500, paid: 100, remaining: 400, recharges: 2, revenue: 10000 }] }],
  } }));
  await page.goto("/creator-dashboard");
  await expect(page.getByRole("heading", { name: "Share links and track your earnings" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("columnheader", { name: "Commission expiry", exact: true })).toBeVisible({ timeout: 60000 });
  expect(clientErrors).toEqual([]);
  await expect(page.getByText("3 months after each user's signup", { exact: true })).toHaveCount(2);
  await expect(page.getByText("User savings", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Share link", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Share link", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { referralShares: ShareData[] }).referralShares[0].url)).toBe("http://localhost:3471/r/creator123");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy referral link", exact: true }).click();
  await expect(page.getByText("Copied successfully.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("http://localhost:3471/r/creator123");
  await page.screenshot({ path: "tmp/creator-dashboard-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Share link", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "tmp/creator-dashboard-mobile.png", fullPage: true });
});
