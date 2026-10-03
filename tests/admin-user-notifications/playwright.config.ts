import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: ".",
	testMatch: "notifications.test.ts",
	workers: 1,
	reporter: "list",
	timeout: 90_000,
	outputDir: "../../tmp/admin-user-notification-results",
	use: {
		baseURL: "http://localhost:3471",
		viewport: { width: 1440, height: 900 },
	},
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:3471/login",
		timeout: 120000,
		reuseExistingServer: false,
		env: {
			PORT: "3471",
			NEXT_DIST_DIR: "tmp/next-user-badge-check",
			DISABLE_REMOTE_REDIS: "1",
		},
	},
});
