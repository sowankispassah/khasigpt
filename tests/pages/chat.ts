import fs from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

const CHAT_ID_REGEX =
  /\/chat\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class ChatPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get sendButton() {
    return this.page.getByTestId("send-button");
  }

  get stopButton() {
    return this.page.getByTestId("stop-button");
  }

  get multimodalInput() {
    return this.page.getByTestId("multimodal-input");
  }

  get scrollContainer() {
    return this.page.locator(".overflow-y-scroll");
  }

  get scrollToBottomButton() {
    return this.page.getByTestId("scroll-to-bottom-button");
  }

  async createNewChat() {
    await this.page.goto("/api/auth/guest?redirectUrl=/chat");
    await this.page.waitForURL("/chat");
  }

  getCurrentURL(): string {
    return this.page.url();
  }

  async sendUserMessage(message: string) {
    await this.multimodalInput.click();
    await this.multimodalInput.fill(message);
    await expect(this.sendButton).toBeEnabled();
    await this.sendButton.click();
    const userMessage = this.page.getByTestId("message-user").last();
    try {
      await expect(userMessage).toBeVisible({ timeout: 3000 });
    } catch {
      await this.multimodalInput.press("Enter");
      await expect(userMessage).toBeVisible();
    }
  }

  async isGenerationComplete() {
    const response = await this.page
      .waitForResponse(
        (currentResponse) => currentResponse.url().includes("/api/chat"),
        { timeout: 30_000 }
      )
      .catch(() => null);

    await response?.finished().catch(() => undefined);
    await expect(this.sendButton).toBeVisible();
    const assistantMessage = this.page.getByTestId("message-assistant").last();
    try {
      await expect(assistantMessage).toBeVisible({ timeout: 5000 });
    } catch {
      const recentChatLink = this.page.locator('a[href^="/chat/"]').first();
      if ((await recentChatLink.count()) > 0) {
        await recentChatLink.click();
      }
      await expect(assistantMessage).toBeVisible();
    }
  }

  async isVoteComplete() {
    const response = await this.page.waitForResponse((currentResponse) =>
      currentResponse.url().includes("/api/vote")
    );

    await response.finished();
  }

  async hasChatIdInUrl() {
    await expect(this.page).toHaveURL(CHAT_ID_REGEX);
  }

  async sendUserMessageFromSuggestion() {
    await this.page
      .getByRole("button", { name: "What are the advantages of" })
      .click();
  }

  async isElementVisible(elementId: string) {
    await expect(this.page.getByTestId(elementId)).toBeVisible();
  }

  async isElementNotVisible(elementId: string) {
    await expect(this.page.getByTestId(elementId)).not.toBeVisible();
  }

  async addImageAttachment() {
    this.page.on("filechooser", async (fileChooser) => {
      const filePath = path.join(
        process.cwd(),
        "public",
        "images",
        "mouth of the seine, monet.jpg"
      );
      const imageBuffer = fs.readFileSync(filePath);

      await fileChooser.setFiles({
        name: "mouth of the seine, monet.jpg",
        mimeType: "image/jpeg",
        buffer: imageBuffer,
      });
    });

    await this.page.getByTestId("attachments-button").click();
  }

  async getSelectedModel() {
    const modelId = await this.page.getByTestId("model-selector").innerText();
    return modelId;
  }

  async chooseModelFromSelector(chatModelId: string) {
    const selected = await this.tryChooseModelFromSelector(chatModelId);
    if (!selected) {
      throw new Error(`Model option not found for ${chatModelId}`);
    }
  }

  async tryChooseModelFromSelector(chatModelId: string) {
    const selector = this.page.getByTestId("model-selector");
    await expect(selector).toBeVisible({ timeout: 5000 });
    await selector.click();
    const directOption = this.page.getByTestId(
      `model-selector-item-${chatModelId}`
    );
    const option =
      (await directOption.count()) > 0
        ? directOption
        : this.page
            .locator('[data-testid^="model-selector-item-"]')
            .filter({ hasText: /reasoning/i })
            .first();
    if ((await option.count()) === 0) {
      await this.page.keyboard.press("Escape");
      return false;
    }
    const isAvailable = await option
      .waitFor({ state: "visible", timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (!isAvailable) {
      await this.page.keyboard.press("Escape");
      return false;
    }
    const optionText = await option.innerText();
    const expectedModelName = optionText
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
    await option.click();
    if (!expectedModelName) {
      throw new Error(`Unable to resolve model label for ${chatModelId}`);
    }
    expect(await this.getSelectedModel()).toContain(expectedModelName);
    return true;
  }

  async getSelectedVisibility() {
    const visibilityId = await this.page
      .getByTestId("visibility-selector")
      .innerText();
    return visibilityId;
  }

  async chooseVisibilityFromSelector(chatVisibility: "public" | "private") {
    await this.page.getByTestId("visibility-selector").click();
    await this.page
      .getByTestId(`visibility-selector-item-${chatVisibility}`)
      .click();
    expect(await this.getSelectedVisibility()).toBe(chatVisibility);
  }

  async getRecentAssistantMessage(): Promise<{
    element: Locator;
    content: string | null;
    reasoning: string | null;
    toggleReasoningVisibility: () => Promise<void>;
    upvote: () => Promise<void>;
    downvote: () => Promise<void>;
  }> {
    const messageElements = await this.page
      .getByTestId("message-assistant")
      .all();
    const lastMessageElement = messageElements.at(-1);

    if (!lastMessageElement) {
      throw new Error("No assistant message found");
    }

    const content = await lastMessageElement
      .getByTestId("message-content")
      .innerText()
      .then((text) => text.trim())
      .catch(() => null);

    const reasoningElement = await lastMessageElement
      .getByTestId("message-reasoning")
      .isVisible()
      .then(async (visible) =>
        visible
          ? await lastMessageElement
              .getByTestId("message-reasoning")
              .innerText()
              .then((text) => text.trim())
          : null
      )
      .catch(() => null);

    return {
      element: lastMessageElement,
      content,
      reasoning: reasoningElement,
      async toggleReasoningVisibility() {
        await lastMessageElement
          .getByTestId("message-reasoning-toggle")
          .click();
      },
      async upvote() {
        await lastMessageElement.getByTestId("message-upvote").click();
      },
      async downvote() {
        await lastMessageElement.getByTestId("message-downvote").click();
      },
    };
  }

  async getRecentUserMessage() {
    await expect(this.page.getByTestId("message-user").last()).toBeVisible();
    const messageElements = await this.page.getByTestId("message-user").all();
    const lastMessageElement = messageElements.at(-1);

    if (!lastMessageElement) {
      throw new Error("No user message found");
    }

    const content = await lastMessageElement
      .getByTestId("message-content")
      .innerText()
      .then((text) => text.trim())
      .catch(() => null);

    const hasAttachments = await lastMessageElement
      .getByTestId("message-attachments")
      .isVisible()
      .catch(() => false);

    const attachments = hasAttachments
      ? await lastMessageElement.getByTestId("message-attachments").all()
      : [];

    const page = this.page;

    return {
      element: lastMessageElement,
      content,
      attachments,
      async edit(newMessage: string) {
        await page.getByTestId("message-edit-button").click();
        await page.getByTestId("message-editor").fill(newMessage);
        await page.getByTestId("message-editor-send-button").click();
        await expect(
          page.getByTestId("message-editor-send-button")
        ).not.toBeVisible();
      },
    };
  }

  async getAssistantMessageCount() {
    return this.page.getByTestId("message-assistant").count();
  }

  async expectToastToContain(text: string) {
    await expect(this.page.getByTestId("toast")).toContainText(text);
  }

  async openSideBar() {
    const sidebarToggleButton = this.page.getByTestId("sidebar-toggle-button");
    await sidebarToggleButton.click();
  }

  isScrolledToBottom(): Promise<boolean> {
    return this.scrollContainer.evaluate(
      (el) => Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 1
    );
  }

  async waitForScrollToBottom(timeout = 5000): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (await this.isScrolledToBottom()) {
        return;
      }
      await this.page.waitForTimeout(100);
    }

    throw new Error(`Timed out waiting for scroll bottom after ${timeout}ms`);
  }

  async sendMultipleMessages(
    count: number,
    makeMessage: (i: number) => string
  ) {
    for (let i = 0; i < count; i++) {
      await this.sendUserMessage(makeMessage(i));
      await this.isGenerationComplete();
    }
  }

  async scrollToTop(): Promise<void> {
    await this.scrollContainer.evaluate((element) => {
      element.scrollTop = 0;
    });
  }
}
