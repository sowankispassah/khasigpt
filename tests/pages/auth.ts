import type { Page } from "@playwright/test";
import { expect } from "../fixtures";

export class AuthPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoLogin() {
    await this.page.goto("/login?credentials=1");
    await expect(
      this.page.getByRole("heading", { name: "Sign In To KhasiGPT" })
    ).toBeVisible();
  }

  async gotoRegister() {
    await this.page.goto("/register?credentials=1");
    await expect(
      this.page.getByRole("heading", { name: "Sign Up To KhasiGPT" })
    ).toBeVisible();
  }

  async register(email: string, password: string) {
    await this.gotoRegister();
    await this.page.getByLabel("Email Address").click();
    await this.page.getByLabel("Email Address").fill(email);
    await this.page.getByLabel("Password").click();
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByLabel("I agree to the").check();
    await this.page.getByRole("button", { name: "Sign Up", exact: true }).click();
  }

  async login(email: string, password: string) {
    await this.gotoLogin();
    await this.page.getByLabel("Email Address").click();
    await this.page.getByLabel("Email Address").fill(email);
    await this.page.getByLabel("Password").click();
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign In" }).click();
  }

  async logout(email: string, password: string) {
    await this.login(email, password);
    await this.page.waitForURL("/chat");

    const userNavButton = this.page.getByRole("button", {
      name: /Open user menu/,
    });
    await expect(userNavButton).toBeVisible();

    await userNavButton.click();
    const userNavMenu = this.page.getByTestId("user-nav-menu");
    await expect(userNavMenu).toBeVisible();

    const authMenuItem = this.page.getByTestId("user-nav-item-auth");
    await expect(authMenuItem).toContainText("Sign out");

    await authMenuItem.click();
    await this.page.waitForURL("/login");
  }

  async expectToastToContain(text: string) {
    await expect(this.page.getByTestId("toast")).toContainText(text);
  }

  async openUserMenu() {
    const userNavButton = this.page.getByRole("button", {
      name: /Open user menu/,
    });
    await expect(userNavButton).toBeVisible();
    await userNavButton.click();
  }
}
