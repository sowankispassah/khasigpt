import { expect, test } from "../fixtures";

test("chat greeting and composer are visible before hydration", async ({
  adaContext,
  browser,
}) => {
  const context = await browser.newContext({
    storageState: await adaContext.context.storageState(),
  });
  try {
    // React's inline stream-reveal scripts must run, but none of the client
    // bundles can load. The chat must come from server HTML, not a mount effect.
    await context.route("**/_next/static/**/*.js", (route) => route.abort());
    const page = await context.newPage();
    await page.goto("/chat");
    await expect(page.getByTestId("multimodal-input")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("multimodal-input")).toBeDisabled();
    await expect(page.getByTestId("chat-greeting")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("chat-greeting")).toHaveText(/\S/);
  } finally {
    await context.close();
  }
});

test("chat remains usable when optional history and prompts fail", async ({
  adaContext,
}) => {
  const page = adaContext.page;
  await page.route("**/api/history?**", (route) => route.fulfill({ status: 503 }));
  await page.route("**/api/prompts**", (route) => route.fulfill({ status: 503 }));
  await page.goto("/chat");
  await page.getByTestId("multimodal-input").fill("A draft without optional data");
  await expect(page.getByTestId("send-button")).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId("chat-greeting")).toBeVisible({ timeout: 15_000 });
  await page.unrouteAll({ behavior: "wait" });
});
