import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "separators.test.ts",
  workers: 1,
  reporter: "list",
  timeout: 90_000,
  outputDir: "../../tmp/chat-date-browser-results",
  use: { baseURL: "http://localhost:3481", timezoneId: "Asia/Kolkata" },
  webServer: {
    command: "node tests/support/production-server.cjs",
    cwd: process.cwd(),
    url: "http://localhost:3481/login",
    timeout: 120_000,
    reuseExistingServer: false,
    env: { PORT: "3481", NEXT_DIST_DIR: ".next", DISABLE_REMOTE_REDIS: "1" },
  },
});
