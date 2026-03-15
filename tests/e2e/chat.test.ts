import { expect, test } from "../fixtures";
import { ChatPage } from "../pages/chat";

test.describe("Chat activity", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.createNewChat();
  });

  test("Send a user message and receive response", async () => {
    await chatPage.sendUserMessage("Why is grass green?");
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain("It's just green duh!");
  });

  test("Redirect to /chat/:id after submitting message", async () => {
    await chatPage.sendUserMessage("Why is grass green?");
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain("It's just green duh!");
    await chatPage.hasChatIdInUrl();
  });

  test("Send a user message from suggestion", async () => {
    await chatPage.sendUserMessageFromSuggestion();
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain(
      "With Next.js, you can ship fast!"
    );
  });

  test("Toggle between send/stop button based on activity", async () => {
    await expect(chatPage.sendButton).toBeVisible();
    await expect(chatPage.sendButton).toBeDisabled();

    await chatPage.sendUserMessage("Why is grass green?");

    await expect(chatPage.sendButton).not.toBeVisible();
    await expect(chatPage.stopButton).toBeVisible();

    await chatPage.isGenerationComplete();

    await expect(chatPage.stopButton).not.toBeVisible();
    await expect(chatPage.sendButton).toBeVisible();
  });

  test("Stop generation during submission", async () => {
    await chatPage.sendUserMessage("Why is grass green?");
    await expect(chatPage.stopButton).toBeVisible();
    await chatPage.stopButton.click();
    await expect(chatPage.sendButton).toBeVisible();
  });

  test("Edit user message and resubmit", async () => {
    await chatPage.sendUserMessage("Why is grass green?");
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain("It's just green duh!");

    const userMessage = await chatPage.getRecentUserMessage();
    await userMessage.edit("Why is the sky blue?");

    await chatPage.isGenerationComplete();

    const updatedAssistantMessage = await chatPage.getRecentAssistantMessage();
    expect(updatedAssistantMessage.content).toContain("It's just blue duh!");
  });

  test("Preserve chat history while switching model mid-conversation", async () => {
    await chatPage.sendUserMessage("Why is grass green?");
    await chatPage.isGenerationComplete();

    const firstAssistantMessage = await chatPage.getRecentAssistantMessage();
    expect(firstAssistantMessage.content).toContain("It's just green duh!");
    const assistantMessageCountBeforeModelSwitch =
      await chatPage.getAssistantMessageCount();

    await chatPage.chooseModelFromSelector("chat-model-reasoning");

    const retainedAssistantMessage = await chatPage.getRecentAssistantMessage();
    expect(retainedAssistantMessage.content).toContain("It's just green duh!");

    await chatPage.sendUserMessage("Why is the sky blue?");
    await chatPage.isGenerationComplete();

    const latestAssistantMessage = await chatPage.getRecentAssistantMessage();
    expect(latestAssistantMessage.content).toContain("It's just blue duh!");
    await expect(
      latestAssistantMessage.element.getByTestId("message-reasoning")
    ).toBeVisible();
    expect(await chatPage.getAssistantMessageCount()).toBe(
      assistantMessageCountBeforeModelSwitch + 1
    );
  });

  test("Hide suggested actions after sending message", async () => {
    await chatPage.isElementVisible("suggested-actions");
    await chatPage.sendUserMessageFromSuggestion();
    await chatPage.isElementNotVisible("suggested-actions");
  });

  test("Upload file and send image attachment with message", async () => {
    await chatPage.addImageAttachment();

    await chatPage.isElementVisible("attachments-preview");
    await chatPage.isElementVisible("input-attachment-loader");
    await chatPage.isElementNotVisible("input-attachment-loader");

    await chatPage.sendUserMessage("Who painted this?");

    const userMessage = await chatPage.getRecentUserMessage();
    expect(userMessage.attachments).toHaveLength(1);

    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toBe("This painting is by Monet!");
  });

  test("Call weather tool", async () => {
    await chatPage.sendUserMessage("What's the weather in sf?");
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();

    expect(assistantMessage.content).toBe(
      "The current temperature in San Francisco is 17°C."
    );
  });

  test("Upvote message", async () => {
    await chatPage.sendUserMessage("Why is the sky blue?");
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    await assistantMessage.upvote();
    await chatPage.isVoteComplete();
  });

  test("Downvote message", async () => {
    await chatPage.sendUserMessage("Why is the sky blue?");
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    await assistantMessage.downvote();
    await chatPage.isVoteComplete();
  });

  test("Show vote actions immediately after streaming completes", async () => {
    await chatPage.sendUserMessage("Why is the sky blue?");
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();

    await expect(chatPage.stopButton).not.toBeVisible({ timeout: 1000 });
    await expect(chatPage.sendButton).toBeVisible({ timeout: 1000 });
    await expect(
      assistantMessage.element.getByTestId("message-upvote")
    ).toBeVisible({ timeout: 1000 });
    await expect(
      assistantMessage.element.getByTestId("message-downvote")
    ).toBeVisible({ timeout: 1000 });
  });

  test("Update vote", async () => {
    await chatPage.sendUserMessage("Why is the sky blue?");
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    await assistantMessage.upvote();
    await chatPage.isVoteComplete();

    await assistantMessage.downvote();
    await chatPage.isVoteComplete();
  });

  test("Create message from url query", async ({ page }) => {
    await page.goto("/?query=Why is the sky blue?");

    await chatPage.isGenerationComplete();

    const userMessage = await chatPage.getRecentUserMessage();
    expect(userMessage.content).toBe("Why is the sky blue?");

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain("It's just blue duh!");
  });

  test("auto-scrolls to bottom after submitting new messages", async () => {
    test.fixme();
    await chatPage.sendMultipleMessages(5, (i) => `filling message #${i}`);
    await chatPage.waitForScrollToBottom();
  });

  test("scroll button appears when user scrolls up, hides on click", async () => {
    test.fixme();
    await chatPage.sendMultipleMessages(5, (i) => `filling message #${i}`);
    await expect(chatPage.scrollToBottomButton).not.toBeVisible();

    await chatPage.scrollToTop();
    await expect(chatPage.scrollToBottomButton).toBeVisible();

    await chatPage.scrollToBottomButton.click();
    await chatPage.waitForScrollToBottom();
    await expect(chatPage.scrollToBottomButton).not.toBeVisible();
  });
});
