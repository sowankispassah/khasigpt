import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { hashSync } from "bcrypt-ts";
import postgres from "postgres";

test.skip(process.env.ISOLATED_TEST_RUN !== "1", "Requires a disposable local audit database");
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

async function verifyScrolling({ page, baseURL }: { page: Page; baseURL?: string }) {
  const url = new URL(process.env.POSTGRES_URL ?? "");
  expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
  expect(url.pathname).toMatch(/^\/khasigpt_audit_/);
  const sql = postgres(url.toString(), { max: 2, onnotice: () => {} });
  const userId = randomUUID();
  const email = `${userId}@example.test`, password = "scroll-fixture-20261006";
  try {
    await sql`insert into "User" (id,email,password,role,"dateOfBirth","firstName","lastName") values (${userId},${email},${hashSync(password, 10)},'admin','1990-01-01','Scroll','Fixture')`;
    const csrf = (await (await page.request.get("/api/auth/csrf")).json()).csrfToken;
    await page.request.post("/api/auth/callback/credentials", { form: { csrfToken: csrf, email, password, callbackUrl: `${baseURL}/subscriptions` }, headers: { "X-Auth-Return-Redirect": "1" } });
    expect((await (await page.request.get("/api/auth/session")).json()).user?.id).toBe(userId);
    await page.route("**/api/explore/search", route => route.fulfill({ json: {
      answer: "Scroll fixture", category: null, chatId: null,
      clientRequestId: route.request().postDataJSON().clientRequestId, locationContextKey: "test",
      location: { id: "test", label: "Shillong, Meghalaya", latitude: 25.57, longitude: 91.88, source: "manual", accuracy: null },
      radiusKm: 50, searchQueries: [], searchMode: "image", partial: false,
      results: Array.from({ length: 24 }, (_, i) => ({ id: `place-${i}`, name: `Scroll place ${i}`, distanceKm: 1, distance: "1 km", sourceUrl: "https://example.test", attributions: [] })),
    } }));
    await page.addInitScript(() => sessionStorage.setItem("explore.locationSession.v2", JSON.stringify({ location: { id: "test", label: "Shillong, Meghalaya", latitude: 25.57, longitude: 91.88, source: "manual", accuracy: null }, query: "", radiusKm: 10, categoryId: null, subcategoryId: null })));
    const input = await page.context().newCDPSession(page);
    for (const width of [page.viewportSize()?.width ?? 1440]) {
      await page.setViewportSize({ width, height: 600 });
      await input.send("Emulation.setTouchEmulationEnabled", { enabled: width === 390 });
      for (const path of ["/subscriptions", "/explore", "/recharge", "/profile", "/privacy-policy", "/about"]) {
        await page.goto(path);
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page.locator("h1").first()).not.toHaveText(/wrong|error/i);
        if (path === "/explore") await expect(page.getByRole("heading", { name: "Scroll place 0", exact: true })).toBeVisible({ timeout: 15000 });
        if (path === "/subscriptions" && width === 1440) {
          const sidebar = page.locator('[data-sidebar="sidebar"][data-mobile]').count();
          expect(await sidebar).toBe(0);
          const handle = page.getByRole("separator", { name: "Resize sidebar" });
          await expect(handle).toBeVisible();
          expect(await handle.evaluate(el => getComputedStyle(el).cursor)).toBe("col-resize");
          const panel = page.locator('[data-sidebar="sidebar"]');
          const main = page.locator("main").first();
          const originalMainWidth = await main.evaluate(el => el.clientWidth);
          await expect.poll(() => panel.evaluate(el => el.getBoundingClientRect().width)).toBe(256);
          const bounds = await handle.boundingBox();
          expect(bounds).not.toBeNull();
          if (!bounds) throw new Error("Missing sidebar resize edge");
          await page.mouse.move(bounds.x + bounds.width / 2, 250);
          await page.mouse.down();
          await page.mouse.move(bounds.x + 180, 250, { steps: 12 });
          await page.mouse.up();
          await expect.poll(() => panel.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(400);
          expect(await main.evaluate(el => el.clientWidth)).toBeLessThan(originalMainWidth - 140);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({ path: "tmp/sidebar-resized.png" });
          await handle.press("End");
          await expect.poll(() => panel.evaluate(el => el.getBoundingClientRect().width)).toBe(480);
          await handle.press("Home");
          await expect.poll(() => panel.evaluate(el => el.getBoundingClientRect().width)).toBe(256);
          await handle.press("ArrowRight");
          await expect.poll(() => panel.evaluate(el => el.getBoundingClientRect().width)).toBe(272);
          await page.keyboard.press("Control+b");
          await expect(handle).toHaveCount(0);
          await page.keyboard.press("Control+b");
          await expect(handle).toBeVisible();
          await expect.poll(() => panel.evaluate(el => el.getBoundingClientRect().width)).toBe(256);
        }
        const before = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: innerHeight }));
        expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe("visible");
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)).toBe("auto");
        const scrollToBottom = async () => {
          if (width === 390) {
            for (let gesture = 0; gesture < Math.ceil(before.height / 350); gesture++) {
              await input.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 450 }] });
              for (let y = 425; y >= 100; y -= 25) {
                await input.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y }] });
              }
              await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            }
          } else {
            await page.mouse.move(width - 40, 450);
            await page.mouse.wheel(0, before.height * 2);
          }
          await expect.poll(() => page.evaluate(() => Math.abs(scrollY + innerHeight - document.documentElement.scrollHeight)), { timeout: 5000, message: `${path} at ${width}px reaches the bottom` }).toBeLessThanOrEqual(2);
        };
        await scrollToBottom();
        if (path === "/subscriptions") {
          await page.getByRole("button", { name: "View recharge history" }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.getByRole("button", { name: "Close", exact: true }).click();
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await scrollToBottom();
        }
        await page.screenshot({ path: `tmp/scroll-${path.slice(1)}-${width}.png` });
      }
    }
    await input.detach();
  } finally {
    await sql`delete from "AuditLog" where "actorId"=${userId}`;
    await sql`delete from "User" where id=${userId}`;
    await sql.end();
  }
}

test.describe("desktop page scrolling", () => {
  test.use({ viewport: { width: 1440, height: 600 } });
  test("long pages reach their bottom, including after closing overlays", verifyScrolling);
});

test.describe("mobile page scrolling", () => {
  test.use({ viewport: { width: 390, height: 600 }, isMobile: true, hasTouch: true });
  test("long pages reach their bottom with touch input, including after closing overlays", verifyScrolling);
});
