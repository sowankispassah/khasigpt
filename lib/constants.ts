export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

// Bcrypt hash for the string "dummy-password" with cost factor 10.
export const DUMMY_PASSWORD =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8/fy2s9kuNJP1s6FHX5eNUsiV6iKa2";

export const TOKENS_PER_CREDIT = 100;
