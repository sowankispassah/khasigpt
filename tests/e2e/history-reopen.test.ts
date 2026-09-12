import { expect, test } from "../fixtures";
import { ChatPage } from "../pages/chat";

test("a history conversation can reopen after returning to blank chat", async ({ page }) => {
  test.setTimeout(60_000);
  const chat = new ChatPage(page);
  await chat.createNewChat();
  await chat.sendUserMessage("Why is grass green?");
  await chat.isGenerationComplete();
  await chat.hasChatIdInUrl();
  const chatPath = new URL(page.url()).pathname;
  await page.goto(chatPath);
  await expect(page.getByTestId("message-assistant")).toBeVisible();
  const historyLink = page.locator(`a[href="${chatPath}"]`);
  await expect(historyLink).toBeVisible();

  // Use the persistent shell's home link so the layout and route cache survive.
  await page.getByRole("link", { name: "KhasiGPT logo KhasiGPT", exact: true }).click();
  await expect(page).toHaveURL(/\/chat(?:\?|$)/);
  await expect(page.getByTestId("chat-greeting")).toBeVisible();
  await expect(historyLink).toHaveAttribute("data-active", "false", { timeout: 5_000 });
  await historyLink.click();
  await expect(page).toHaveURL(new RegExp(`${chatPath}$`));
  await expect(page.getByTestId("message-assistant")).toContainText("It's just green duh!");
  await expect(page.getByTestId("multimodal-input")).toBeEnabled();
});
