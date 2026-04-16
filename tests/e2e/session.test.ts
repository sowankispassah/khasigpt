import type { Request as PlaywrightRequest } from "@playwright/test";
import { getMessageByErrorCode } from "@/lib/errors";
import { expect, test } from "../fixtures";
import { generateRandomTestUser } from "../helpers";
import { AuthPage } from "../pages/auth";
import { ChatPage } from "../pages/chat";

test.describe
  .serial("Guest Session", () => {
    test("Redirect anonymous visitors to login when a new session is loaded", async ({
      page,
    }) => {
      const response = await page.goto("/");

      if (!response) {
        throw new Error("Failed to load page");
      }

      let request: PlaywrightRequest | null = response.request();

      const chain: string[] = [];

      while (request) {
        chain.unshift(request.url());
        request = request.redirectedFrom() ?? null;
      }

      expect(chain).toEqual([
        "http://localhost:3000/",
        "http://localhost:3000/login?callbackUrl=%2Fchat",
      ]);
    });

    test("Sign out is available for explicit guest users", async ({ page }) => {
      await page.goto("/api/auth/guest?redirectUrl=/chat");
      await page.waitForURL("/chat");

      const sidebarToggleButton = page.getByTestId("sidebar-toggle-button");
      await sidebarToggleButton.click();

      const userNavButton = page.getByRole("button", {
        name: /Open user menu/,
      });
      await expect(userNavButton).toBeVisible();

      await userNavButton.click();
      const userNavMenu = page.getByTestId("user-nav-menu");
      await expect(userNavMenu).toBeVisible();

      const authMenuItem = page.getByTestId("user-nav-item-auth");
      await expect(authMenuItem).toContainText("Sign out");
    });

    test("Do not authenticate as guest user when an existing non-guest session is active", async ({
      adaContext,
    }) => {
      const response = await adaContext.page.goto("/");

      if (!response) {
        throw new Error("Failed to load page");
      }

      let request: PlaywrightRequest | null = response.request();

      const chain: string[] = [];

      while (request) {
        chain.unshift(request.url());
        request = request.redirectedFrom() ?? null;
      }

      expect(chain).toEqual([
        "http://localhost:3000/",
        "http://localhost:3000/chat",
      ]);
    });

    test("Allow navigating to /login as guest user", async ({ page }) => {
      await page.goto("/login");
      await page.waitForURL("/login");
      await expect(page).toHaveURL("/login");
    });

    test("Allow navigating to /register as guest user", async ({ page }) => {
      await page.goto("/register");
      await page.waitForURL("/register");
      await expect(page).toHaveURL("/register");
    });

    test("Do not show email in user menu for guest user", async ({ page }) => {
      await page.goto("/api/auth/guest?redirectUrl=/chat");
      await page.waitForURL("/chat");

      const userNavButton = page.getByRole("button", {
        name: /Open user menu/,
      });
      await expect(userNavButton).toBeVisible();
      await userNavButton.click();

      const userEmail = page.getByTestId("user-nav-item-email");
      await expect(userEmail).toContainText("Guest");
    });
  });

test.describe
  .serial("Login and Registration", () => {
    let authPage: AuthPage;

    const testUser = generateRandomTestUser();

    test.beforeEach(({ page }) => {
      authPage = new AuthPage(page);
    });

    test("Register new account", async () => {
      await authPage.register(testUser.email, testUser.password);
      await authPage.expectToastToContain("Check your email");
    });

    test("Register new account with existing email", async () => {
      await authPage.register(testUser.email, testUser.password);
      await authPage.expectToastToContain("Account already exists!");
    });

    test("Log into account that exists", async ({ page }) => {
      await authPage.login(testUser.email, testUser.password);

      await page.waitForURL("/chat");
      await expect(page.getByPlaceholder("Send a message...")).toBeVisible();
    });

    test("Display user name in user menu", async ({ page }) => {
      await authPage.login(testUser.email, testUser.password);

      await page.waitForURL("/chat");
      await expect(page.getByPlaceholder("Send a message...")).toBeVisible();

      await authPage.openUserMenu();
      const userLabel = await page.getByTestId("user-nav-item-email");
      await expect(userLabel).toHaveText("Playwright User");
    });

    test("Log out as non-guest user", async () => {
      await authPage.logout(testUser.email, testUser.password);
    });

    test("Do not force create a guest session if non-guest session already exists", async ({
      page,
    }) => {
      await authPage.login(testUser.email, testUser.password);
      await page.waitForURL("/chat");

      await authPage.openUserMenu();
      const userLabel = await page.getByTestId("user-nav-item-email");
      await expect(userLabel).toHaveText("Playwright User");

      await page.goto("/api/auth/guest");
      await page.waitForURL("/chat");

      await authPage.openUserMenu();
      const updatedUserLabel = await page.getByTestId("user-nav-item-email");
      await expect(updatedUserLabel).toHaveText("Playwright User");
    });

    test("Log out is available for non-guest users", async ({ page }) => {
      await authPage.login(testUser.email, testUser.password);
      await page.waitForURL("/chat");

      const userNavButton = page.getByRole("button", {
        name: /Open user menu/,
      });
      await expect(userNavButton).toBeVisible();

      await userNavButton.click();
      const userNavMenu = page.getByTestId("user-nav-menu");
      await expect(userNavMenu).toBeVisible();

      const authMenuItem = page.getByTestId("user-nav-item-auth");
      await expect(authMenuItem).toContainText("Sign out");
    });

    test("Do not navigate to /register for non-guest users", async ({
      page,
    }) => {
      await authPage.login(testUser.email, testUser.password);
      await page.waitForURL("/chat");

      await page.goto("/register");
      await expect(page).toHaveURL("/chat");
    });

    test("Do not navigate to /login for non-guest users", async ({ page }) => {
      await authPage.login(testUser.email, testUser.password);
      await page.waitForURL("/chat");

      await page.goto("/login");
      await expect(page).toHaveURL("/chat");
    });
  });

test.describe("Entitlements", () => {
  let chatPage: ChatPage;

  test.beforeEach(({ page }) => {
    chatPage = new ChatPage(page);
  });

  test("Guest user cannot send more than 20 messages/day", async () => {
    test.fixme();
    await chatPage.createNewChat();

    for (let i = 0; i <= 20; i++) {
      await chatPage.sendUserMessage("Why is the sky blue?");
      await chatPage.isGenerationComplete();
    }

    await chatPage.sendUserMessage("Why is the sky blue?");
    await chatPage.expectToastToContain(
      getMessageByErrorCode("rate_limit:chat")
    );
  });
});
