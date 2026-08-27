import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("live current information", () => {
  test("uses India Standard Time and requires a user-provided weather location", async () => {
    const service = await readWorkspaceFile("lib/current-info/service.ts");
    expect(service).toContain('DEFAULT_TIMEZONE = "Asia/Kolkata"');
    expect(service).toContain(
      "A user-provided location is required for live weather.",
    );
    expect(service).not.toContain("DEFAULT_WEATHER_LOCATION");
    expect(service).not.toContain("Your detected location");
  });

  test("keeps live facts ahead of RAG and provider search in the shared chat route", async () => {
    const [route, service] = await Promise.all([
      readWorkspaceFile("app/(chat)/api/chat/route.ts"),
      readWorkspaceFile("lib/current-info/service.ts"),
    ]);

    expect(route).toContain("resolveCurrentInfoDecision");
    expect(route).toContain("getLiveCurrentInfo");
    expect(route).toContain("!currentInfoDecision.intent");
    expect(route).toContain("shouldAskForWeatherLocation");
    expect(route).toContain("Do not infer a location from IP address");
    expect(route).toContain("Trusted live current-information data is attached below");
    expect(route).toContain("Do not guess or provide a stale answer");
    expect(service).toContain("api.open-meteo.com/v1/forecast");
    expect(service).toContain("geocoding-api.open-meteo.com/v1/search");
    expect(service).toContain("Asia/Kolkata");
    expect(service).toContain("Do not estimate, invent a forecast, or use model memory");
  });
});
