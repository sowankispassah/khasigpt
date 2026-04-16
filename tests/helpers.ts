import fs from "node:fs";
import path from "node:path";
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Page,
} from "@playwright/test";
import { generateId } from "ai";
import { getUnixTime } from "date-fns";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const postgresUrl = process.env.POSTGRES_URL;

if (!postgresUrl) {
  throw new Error("POSTGRES_URL is required for Playwright auth helpers");
}

const sql = postgres(postgresUrl, {
  max: 1,
});

export type UserContext = {
  context: BrowserContext;
  page: Page;
  request: APIRequestContext;
};

async function hashPassword(password: string) {
  const { genSaltSync, hashSync } = await import("bcrypt-ts");
  const salt = genSaltSync(10);
  return hashSync(password, salt);
}

async function ensureCredentialsUser(email: string, password: string, name: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const hashedPassword = await hashPassword(password);
  const [existingUser] = await sql<{ id: string }[]>`
    select id
    from "User"
    where lower(email) = lower(${normalizedEmail})
    limit 1
  `;

  const firstName = name.trim().slice(0, 32) || "Playwright";
  const lastName = "User";
  const dateOfBirth = "1990-01-01";

  if (existingUser?.id) {
    await sql`
      update "User"
      set
        password = ${hashedPassword},
        "isActive" = true,
        "authProvider" = 'credentials',
        "firstName" = ${firstName},
        "lastName" = ${lastName},
        "dateOfBirth" = ${dateOfBirth},
        "updatedAt" = now()
      where id = ${existingUser.id}
    `;
    return;
  }

  await sql`
    insert into "User" (
      email,
      password,
      role,
      "authProvider",
      "isActive",
      "firstName",
      "lastName",
      "dateOfBirth",
      "createdAt",
      "updatedAt"
    ) values (
      ${normalizedEmail},
      ${hashedPassword},
      'regular',
      'credentials',
      true,
      ${firstName},
      ${lastName},
      ${dateOfBirth},
      now(),
      now()
    )
  `;
}

export async function createAuthenticatedContext({
  browser,
  name,
}: {
  browser: Browser;
  name: string;
}): Promise<UserContext> {
  const directory = path.join(__dirname, "../playwright/.sessions");

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const storageFile = path.join(directory, `${name}.json`);

  const context = await browser.newContext();
  const page = await context.newPage();

  const email = `test-${name}@playwright.com`;
  const password = generateId();

  await ensureCredentialsUser(email, password, name);

  await page.goto("/login?callbackUrl=/chat&credentials=1");
  await page.getByLabel("Email Address").click();
  await page.getByLabel("Email Address").fill(email);
  await page.getByLabel("Password").click();
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/chat(?:\?.*)?$/);

  await page.waitForTimeout(1000);
  await context.storageState({ path: storageFile });
  await page.close();

  const newContext = await browser.newContext({ storageState: storageFile });
  const newPage = await newContext.newPage();

  return {
    context: newContext,
    page: newPage,
    request: newContext.request,
  };
}

export function generateRandomTestUser() {
  const email = `test-${getUnixTime(new Date())}@playwright.com`;
  const password = generateId();

  return {
    email,
    password,
  };
}
