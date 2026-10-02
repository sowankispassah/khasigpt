import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "api.test.ts", workers: 1, reporter: "list",
  outputDir: "../../tmp/referral-api-results",
  use: { baseURL: "http://127.0.0.1:3471" },
  webServer: {
    command: "pnpm dev", url: "http://127.0.0.1:3471/login", timeout: 120000,
    reuseExistingServer: false,
    env: { PORT: "3471", NEXT_DIST_DIR: "tmp/next-referral-check", DISABLE_REMOTE_REDIS: "1" },
  },
});
