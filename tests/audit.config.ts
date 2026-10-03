import { defineConfig } from "@playwright/test";

// These suites exercise pure code and source contracts. The integration suites
// omitted here overwrite shared settings and require a dedicated test database.
export default defineConfig({
  testDir: "./routes",
  testIgnore: ["chat.test.ts", "document.test.ts", "security.test.ts", "translate.test.ts"],
  timeout: 30_000,
  workers: 2,
  reporter: "list",
});
