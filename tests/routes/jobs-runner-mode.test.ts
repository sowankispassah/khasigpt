import { expect, test } from "@playwright/test";
import { JOBS_SCRAPE_RUNNER_MODE_SETTING_KEY } from "@/lib/constants";
import { normalizeAppSettingValueForWrite } from "@/lib/db/app-setting-validation";
import {
  isJobsScrapeTriggerAllowed,
  parseJobsScrapeRunnerMode,
} from "@/lib/jobs/schedule";

test("jobs runner defaults to the existing project schedule", () => {
  expect(parseJobsScrapeRunnerMode(null)).toBe("project");
  expect(parseJobsScrapeRunnerMode("unexpected")).toBe("project");
  expect(parseJobsScrapeRunnerMode("chatgpt")).toBe("chatgpt");
  expect(parseJobsScrapeRunnerMode(" ChatGPT ")).toBe("chatgpt");
});

test("ChatGPT mode blocks every site scrape trigger", () => {
  expect(isJobsScrapeTriggerAllowed("chatgpt", "cron")).toBe(false);
  expect(isJobsScrapeTriggerAllowed("chatgpt", "auto")).toBe(false);
  expect(isJobsScrapeTriggerAllowed("chatgpt", "manual")).toBe(false);
  expect(isJobsScrapeTriggerAllowed("chatgpt", "chatgpt")).toBe(true);
});

test("project mode blocks the ChatGPT scheduled trigger", () => {
  expect(isJobsScrapeTriggerAllowed("project", "cron")).toBe(true);
  expect(isJobsScrapeTriggerAllowed("project", "auto")).toBe(true);
  expect(isJobsScrapeTriggerAllowed("project", "manual")).toBe(true);
  expect(isJobsScrapeTriggerAllowed("project", "chatgpt")).toBe(false);
});

test("only valid runner modes can be stored", () => {
  expect(
    normalizeAppSettingValueForWrite(JOBS_SCRAPE_RUNNER_MODE_SETTING_KEY, "chatgpt")
  ).toBe("chatgpt");
  expect(() =>
    normalizeAppSettingValueForWrite(JOBS_SCRAPE_RUNNER_MODE_SETTING_KEY, "unknown")
  ).toThrow("invalid_jobs_scrape_runner_mode_setting");
});
