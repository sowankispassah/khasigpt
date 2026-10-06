import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { isInsideMeghalaya } from "@/lib/explore/geo";
import * as acquisition from "@/lib/explore/location-acquisition";

function locationService(state: string) {
  let calls = 0;
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync("lib/explore/location-service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports, URL, AbortController, setTimeout, clearTimeout,
    console: { error() {} }, process: { env: { GOOGLE_MAPS_API_KEY: "fixture" } },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "@/lib/explore/geo") return { isInsideMeghalaya };
      if (name === "@/lib/explore/location-acquisition") return acquisition;
      throw new Error(`Unexpected import ${name}`);
    },
    fetch: async () => {
      calls++;
      return Response.json({ status: "OK", results: [{ place_id: "fixture", formatted_address: state, address_components: [{ types: ["administrative_area_level_1"], long_name: state }] }] });
    },
  });
  return { service: exports, calls: () => calls };
}

test("a coarse outside estimate is unconfirmed and does not query a geocoder", async () => {
  const { service, calls } = locationService("Assam");
  await expect(service.reverseGeocodeExploreLocation({ latitude: 26.8, longitude: 91.8, accuracy: 200000 })).rejects.toMatchObject({ code: acquisition.LOCATION_ACCURACY_ERROR });
  expect(calls()).toBe(0);
});

test("coarse coordinates confirmed in Meghalaya still work", async () => {
  const { service } = locationService("Meghalaya");
  await expect(service.reverseGeocodeExploreLocation({ latitude: 25.57, longitude: 91.88, accuracy: 200000 })).resolves.toMatchObject({ source: "gps", accuracy: 200000 });
});

test("an accurate outside reading retains the region restriction", async () => {
  const { service } = locationService("Assam");
  await expect(service.reverseGeocodeExploreLocation({ latitude: 26.8, longitude: 91.8, accuracy: 30 })).rejects.toMatchObject({ code: "location_outside_meghalaya" });
});

test("coarse border estimates rejected by the geocoder are unconfirmed", async () => {
  const { service } = locationService("Assam");
  await expect(service.reverseGeocodeExploreLocation({ latitude: 25.9, longitude: 91.88, accuracy: 200000 })).rejects.toMatchObject({ code: acquisition.LOCATION_ACCURACY_ERROR });
});

test("current location retries once and recovers with a fresh confirmed reading", async () => {
  let reads = 0;
  const result = await acquisition.acquireCurrentLocation(
    async () => ({ latitude: ++reads === 1 ? 26.8 : 25.57, longitude: 91.88, accuracy: reads === 1 ? 200000 : 30 }),
    async position => {
      if (position.accuracy !== null && position.accuracy > 10000) throw new acquisition.LocationResolutionError("Unconfirmed", acquisition.LOCATION_ACCURACY_ERROR);
      return position;
    },
    error => error instanceof acquisition.LocationResolutionError && error.code === acquisition.LOCATION_ACCURACY_ERROR,
  );
  expect(reads).toBe(2);
  expect(result.latitude).toBe(25.57);
});

test("repeated approximate readings stop after two attempts; service failures never retry GPS", async () => {
  for (const code of [acquisition.LOCATION_ACCURACY_ERROR, "location_provider_unavailable"]) {
    let reads = 0;
    await expect(acquisition.acquireCurrentLocation(
      async () => { reads++; return { latitude: 26.8, longitude: 91.88, accuracy: 200000 }; },
      async () => { throw new acquisition.LocationResolutionError("Unconfirmed", code); },
      error => error instanceof acquisition.LocationResolutionError && error.code === acquisition.LOCATION_ACCURACY_ERROR,
    )).rejects.toMatchObject({ code });
    expect(reads).toBe(code === acquisition.LOCATION_ACCURACY_ERROR ? 2 : 1);
  }
});
