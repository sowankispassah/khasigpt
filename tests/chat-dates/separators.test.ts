import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import postgres from "postgres";

config({ path: ".env" });

test.beforeEach(async ({ context, page, baseURL }) => {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const databaseUrl = process.env.POSTGRES_URL;
  if (!baseURL || new URL(baseURL).hostname !== "localhost" || !secret || !databaseUrl) {
    throw new Error("Chat UI verification requires a local server.");
  }
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [account] = await sql`SELECT id, "firstName", "lastName", "dateOfBirth" FROM "User" WHERE role = 'admin' AND "isActive" = true LIMIT 1`;
    if (!account) throw new Error("Active account required for read-only UI verification.");
    const name = "authjs.session-token";
    const token = { ...account, role: "admin", roleRefreshedAt: Date.now(), dbRefreshedAt: Date.now(), imageVersion: null };
    const value = await encode({ secret, salt: name, maxAge: 600, token });
    await context.addCookies([{ name, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  } finally {
    await sql.end();
  }
  // Verify the real chat UI and SDK transport without writing messages or
  // spending credits. All browser-driven mutations receive fixture responses.
  await page.route("**/api/**", async (route) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(route.request().method())) {
      await route.fulfill({ json: { ok: true } });
    } else await route.continue();
  });
});

for (const [name, viewport, dark] of [
  ["desktop light", { width: 1440, height: 900 }, false],
  ["mobile dark", { width: 390, height: 844 }, true],
] as const) {
  test(`separators stay centered and group live messages in ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
    await page.addInitScript((theme) => localStorage.setItem("theme", theme), dark ? "dark" : "light");
    let timestamp = "2026-10-02T10:40:00.000Z";
    await page.clock.setFixedTime(new Date("2026-10-02T11:00:00Z"));
    await page.route("**/api/chat", async (route) => {
      const body = route.request().postDataJSON();
      const assistantId = randomUUID();
      const chunks = [
        { type: "data-messageTimestamp", transient: true, data: { id: body.message.id, createdAt: timestamp } },
        { type: "start", messageId: assistantId, messageMetadata: { createdAt: timestamp } },
        { type: "text-start", id: "text" },
        { type: "text-delta", id: "text", delta: "Test response." },
        { type: "text-end", id: "text" },
        { type: "finish" },
      ];
      await route.fulfill({ contentType: "text/event-stream", headers: { "x-vercel-ai-ui-message-stream": "v1" }, body: `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n` });
    });
    await page.goto("/");
    const input = page.getByTestId("multimodal-input");
    await expect(input).toBeVisible({ timeout: 60_000 });
    const send = async (text: string) => {
      await input.fill(text);
      await page.getByTestId("send-button").click();
      await expect(page.getByTestId("stop-button")).toHaveCount(0);
      await expect(page.getByTestId("chat-date-separator").first()).toBeVisible();
    };
    await send("First fixture message");
    const separators = page.getByTestId("chat-date-separator");
    await expect(separators).toHaveText(["Today 4:10 PM"]);
    timestamp = "2026-10-02T11:15:00.000Z";
    await send("Same day fixture message");
    await expect(separators).toHaveCount(1);
    await page.clock.setFixedTime(new Date("2026-10-03T06:05:00Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    timestamp = "2026-10-03T06:05:00.000Z";
    await send("Next day fixture message");
    await expect(separators).toHaveText(["Yesterday 4:10 PM", "Today 11:35 AM"]);
    for (const marker of await separators.all()) {
      const container = await marker.boundingBox();
      const text = await marker.locator("time").boundingBox();
      expect(container).not.toBeNull();
      expect(text).not.toBeNull();
      if (container && text) expect(Math.abs(text.x + text.width / 2 - (container.x + container.width / 2))).toBeLessThan(2);
      await expect(marker.locator("time")).toHaveCSS("font-size", "12px");
    }
    await page.screenshot({ path: `tmp/chat-date-${dark ? "mobile-dark" : "desktop-light"}.png` });
  });
}
