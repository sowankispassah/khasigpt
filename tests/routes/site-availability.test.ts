import { expect, test } from "@playwright/test";
import { parseSiteAvailability, SITE_LAUNCH_SETTING_KEYS } from "@/lib/settings/site-availability";
import { createSiteAvailabilityReader } from "@/lib/settings/site-availability-reader";
import { withTimeout } from "@/lib/utils/async";

const rows = [{ key: "site.publicLaunched", value: true, updatedAt: new Date() }];

test("coalesces concurrent gate reads into one six-key database read", async () => {
  let calls = 0;
  let requestedKeys: string[] = [];
  const read = createSiteAvailabilityReader(async (keys) => {
    calls += 1;
    requestedKeys = keys;
    return rows;
  });
  const states = await Promise.all(Array.from({ length: 50 }, () => read()));
  expect(calls).toBe(1);
  expect(requestedKeys).toEqual([...SITE_LAUNCH_SETTING_KEYS]);
  expect(states.every((state) => state.publicLaunched)).toBe(true);
});

test("a caller deadline does not queue another query behind an unfinished read", async () => {
  let calls = 0;
  let complete!: (result: typeof rows) => void;
  const databaseRead = new Promise<typeof rows>((resolve) => { complete = resolve; });
  const read = createSiteAvailabilityReader(async () => { calls += 1; return databaseRead; });
  await expect(withTimeout(read(), 10)).rejects.toThrow("timeout");
  const nextRequest = read();
  expect(calls).toBe(1);
  complete(rows);
  expect((await nextRequest).publicLaunched).toBe(true);
});

test("failed settings reads reject and can recover without caching a fabricated state", async () => {
  let calls = 0;
  const read = createSiteAvailabilityReader(async () => {
    if (++calls === 1) throw new Error("database unavailable");
    return rows;
  });
  await expect(read()).rejects.toThrow("database unavailable");
  expect((await read()).publicLaunched).toBe(true);
  expect(calls).toBe(2);
});

test("explicit launch and admin settings override the legacy mode", () => {
  const state = parseSiteAvailability(new Map<string, unknown>([
    ["site.launch.enabled", "enabled"],
    ["site.publicLaunched", false],
    ["site.underMaintenance", true],
    ["site.adminEntry.enabled", false],
    ["site.prelaunch.inviteOnly", true],
  ]));
  expect(state.publicLaunched).toBe(false);
  expect(state.underMaintenance).toBe(true);
  expect(state.adminAccessEnabled).toBe(false);
  expect(state.inviteOnlyPrelaunch).toBe(true);
});

test("legacy admin-only mode never makes the public site available", () => {
  const state = parseSiteAvailability(new Map<string, unknown>([
    ["site.launch.enabled", "admin_only"],
  ]));
  expect(state.publicLaunched).toBe(false);
  expect(state.adminAccessEnabled).toBe(true);
});
