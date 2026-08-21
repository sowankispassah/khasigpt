import { expect, test } from "@playwright/test";

test.use({ viewport: { height: 812, width: 375 } });

test("shows the visibility selector without responsive header collisions", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/api/auth/guest?redirectUrl=/chat");
  await page.waitForURL(/\/chat(?:\?|$)/);
  const chatId = "7c90fe1a-1b3a-4e79-b667-2eb977b60b10";
  await page.context().addCookies([
    {
      name: "recent-chat-id",
      value: `${chatId}|${Date.now()}`,
      url: "http://localhost:3000",
    },
  ]);
  await page.goto(`/chat/${chatId}`);

  const selector = page.getByTestId("visibility-selector");
  const newChat = page.getByRole("button", { name: /new chat/i });
  await expect(selector).toBeVisible({ timeout: 10_000 });
  await expect(selector).toContainText(/private|public/i, { timeout: 10_000 });
  await expect(newChat).toBeVisible({ timeout: 10_000 });

  const selectorBox = await selector.boundingBox();
  const newChatBox = await newChat.boundingBox();
  if (!(selectorBox && newChatBox)) {
    throw new Error("Responsive chat header controls must have visible bounds");
  }
  expect(selectorBox.x + selectorBox.width).toBeLessThanOrEqual(newChatBox.x);

  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
  await expect(
    page.locator(
      "[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay"
    )
  ).toHaveCount(0);
  expect(consoleErrors).toEqual([]);

  await page.screenshot({
    path: "test-results/responsive-visibility-check.png",
  });
});
