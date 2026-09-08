import { expect, test } from "../fixtures";

test("chat greeting and composer are visible before JavaScript runs", async ({
  adaContext,
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await adaContext.context.storageState(),
  });
  try {
    const page = await context.newPage();
    await page.goto("/chat");
    await expect(page.getByTestId("multimodal-input")).toBeVisible();
    await expect(page.getByText("How can I help you today?", { exact: true })).toBeVisible();
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
  await expect(page.getByTestId("send-button")).toBeEnabled();
  await expect(page.getByText("How can I help you today?", { exact: true })).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
});
