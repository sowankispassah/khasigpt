import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import {
  getJobsListReturn,
  getJobsListViewKey,
  readJobsListView,
  rememberJobsListDeparture,
  saveJobsListView,
} from "@/lib/jobs/list-view-state";

test("returning to jobs retains filters, all loaded pages and the inner scroll offset", () => {
  const key = getJobsListViewKey("return-test", "kha");
  const state = { filters: { q: "officer", company: "Government", location: "Shillong", type: "government" }, visibleCount: 36, scrollTop: 1870 };
  saveJobsListView(key, state);
  rememberJobsListDeparture(key, "/jobs/officer", "/chat?mode=jobs&new=1", 4);
  expect(readJobsListView(key)).toEqual(state);
  expect(getJobsListReturn(key, "/jobs/officer", 5)).toEqual({ href: "/chat?mode=jobs&new=1", useHistoryBack: true });
  expect(getJobsListReturn(key, "/jobs/officer", 6)?.useHistoryBack).toBe(false);
  expect(getJobsListReturn(key, "/jobs/other", 5)).toBeNull();
});

test("new accounts and languages start independently and arbitrary return URLs are rejected", () => {
  const key = getJobsListViewKey("isolation-test", "kha");
  saveJobsListView(key, { filters: { q: "teacher", company: "", location: "", type: "" }, visibleCount: 48, scrollTop: 900 });
  expect(readJobsListView(getJobsListViewKey("other-account", "kha")).visibleCount).toBe(12);
  expect(readJobsListView(getJobsListViewKey("isolation-test", "en")).scrollTop).toBe(0);
  rememberJobsListDeparture(key, "/jobs/teacher", "https://example.com/chat", 3);
  expect(getJobsListReturn(key, "/jobs/teacher", 4)).toBeNull();
  rememberJobsListDeparture(key, "/jobs/teacher", "//example.com/chat", 3);
  expect(getJobsListReturn(key, "/jobs/teacher", 4)).toBeNull();
});

test("a returned list renders the previously expanded count even after data is replaced", () => {
  // Playwright replaces JSX with component-test objects; use React's normal runtime.
  const result = spawnSync(process.execPath, [
    require.resolve("tsx/cli"), "--tsconfig", "tests/support/react-unit-tsconfig.json", "tests/support/jobs-list-render.tsx",
  ], { encoding: "utf8", timeout: 20_000 });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ expanded: true, paginated: true, afterReplacement: true, shorterResult: true });
});
