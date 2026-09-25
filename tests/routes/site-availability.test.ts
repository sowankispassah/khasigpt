import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { SITE_MOBILE_APP_LAUNCHED_SETTING_KEY } from "@/lib/constants";
import { normalizeAppSettingValueForWrite } from "@/lib/db/app-setting-validation";
import { parseSiteAvailability, SITE_LAUNCH_SETTING_KEYS } from "@/lib/settings/site-availability";
import { createSiteAvailabilityReader } from "@/lib/settings/site-availability-reader";
import { withTimeout } from "@/lib/utils/async";

const rows = [
  { key: "site.publicLaunched", value: true, updatedAt: new Date() },
  { key: "site.mobileAppLaunched", value: true, updatedAt: new Date() },
];

test("coalesces concurrent gate reads into one shared database read", async () => {
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
  expect(states.every((state) => state.webLaunched)).toBe(true);
  expect(states.every((state) => state.mobileAppLaunched)).toBe(true);
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
  expect((await nextRequest).webLaunched).toBe(true);
});

test("failed settings reads reject and can recover without caching a fabricated state", async () => {
  let calls = 0;
  const read = createSiteAvailabilityReader(async () => {
    if (++calls === 1) throw new Error("database unavailable");
    return rows;
  });
  await expect(read()).rejects.toThrow("database unavailable");
  expect((await read()).webLaunched).toBe(true);
  expect(calls).toBe(2);
});

test("explicit launch and admin settings override the legacy mode", () => {
  const state = parseSiteAvailability(new Map<string, unknown>([
    ["site.launch.enabled", "enabled"],
    ["site.publicLaunched", false],
    ["site.mobileAppLaunched", true],
    ["site.underMaintenance", true],
    ["site.adminEntry.enabled", false],
    ["site.prelaunch.inviteOnly", true],
  ]));
  expect(state.webLaunched).toBe(false);
  expect(state.mobileAppLaunched).toBe(true);
  expect(state.underMaintenance).toBe(true);
  expect(state.adminAccessEnabled).toBe(false);
  expect(state.inviteOnlyPrelaunch).toBe(true);
});

test("legacy admin-only mode never makes the public site available", () => {
  const state = parseSiteAvailability(new Map<string, unknown>([
    ["site.launch.enabled", "admin_only"],
  ]));
  expect(state.webLaunched).toBe(false);
  expect(state.adminAccessEnabled).toBe(true);
});

for (const [webLaunched, mobileAppLaunched] of [
  [true, false],
  [false, true],
  [true, true],
  [false, false],
] as const) {
  test(`keeps web=${webLaunched} and mobile=${mobileAppLaunched} launch states independent`, () => {
    const state = parseSiteAvailability(
      new Map<string, unknown>([
        ["site.publicLaunched", webLaunched],
        ["site.mobileAppLaunched", mobileAppLaunched],
      ])
    );

    expect(state.webLaunched).toBe(webLaunched);
    expect(state.mobileAppLaunched).toBe(mobileAppLaunched);
  });
}

test("keeps the public endpoint compatible with installed native releases", async () => {
  const [route, nativeClient, nativeGate] = await Promise.all([
    readFile("app/api/public/site-launch/route.ts", "utf8"),
    readFile("native/src/api/client.ts", "utf8"),
    readFile("native/src/screens/LaunchGateScreen.tsx", "utf8"),
  ]);

  expect(route).toContain("publicLaunched: availability.mobileAppLaunched");
  expect(nativeClient).toContain("mobileAppLaunched: boolean");
  expect(nativeGate).toContain("status.mobileAppLaunched");
});

test("admin exposes Web and Mobile launch controls in order", async () => {
  const [panel, route, migration] = await Promise.all([
    readFile(
      "app/(admin)/admin/settings/site-access-settings-panel.tsx",
      "utf8"
    ),
    readFile("app/api/admin/settings/site-access/route.ts", "utf8"),
    readFile(
      "lib/db/migrations/0098_independent_mobile_launch_gate.sql",
      "utf8"
    ),
  ]);

  expect(panel.indexOf('title: "Web launched"')).toBeLessThan(
    panel.indexOf('title: "Mobile app launched"')
  );
  expect(route).toContain(
    "mobileAppLaunched: SITE_MOBILE_APP_LAUNCHED_SETTING_KEY"
  );
  expect(migration).toContain("ON CONFLICT (\"key\") DO NOTHING");
});

test("mobile launch writes accept booleans and reject ambiguous values", () => {
  expect(
    normalizeAppSettingValueForWrite(
      SITE_MOBILE_APP_LAUNCHED_SETTING_KEY,
      "on"
    )
  ).toBe(true);
  expect(() =>
    normalizeAppSettingValueForWrite(
      SITE_MOBILE_APP_LAUNCHED_SETTING_KEY,
      "sometimes"
    )
  ).toThrow("invalid_boolean_app_setting:site.mobileAppLaunched");
});
