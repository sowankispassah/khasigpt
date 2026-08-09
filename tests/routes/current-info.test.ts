import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("live current information", () => {
  test("uses India Standard Time and a safe weather fallback", async () => {
    const service = await readWorkspaceFile("lib/current-info/service.ts");
    expect(service).toContain('DEFAULT_TIMEZONE = "Asia/Kolkata"');
    expect(service).toContain('name: "Shillong, Meghalaya, India"');
    expect(service).toContain("latitude: 25.5788");
    expect(service).toContain("longitude: 91.8933");
  });

  test("keeps live facts ahead of RAG and provider search in the shared chat route", async () => {
    const [route, service] = await Promise.all([
      readWorkspaceFile("app/(chat)/api/chat/route.ts"),
      readWorkspaceFile("lib/current-info/service.ts"),
    ]);

    expect(route).toContain("detectCurrentInfoNeed");
    expect(route).toContain("getLiveCurrentInfo");
    expect(route).toContain("!currentInfoDecision.intent");
    expect(route).toContain("Trusted live current-information data is attached below");
    expect(route).toContain("Do not guess or provide a stale answer");
    expect(service).toContain("api.open-meteo.com/v1/forecast");
    expect(service).toContain("geocoding-api.open-meteo.com/v1/search");
    expect(service).toContain("Asia/Kolkata");
    expect(service).toContain("Do not estimate, invent a forecast, or use model memory");
  });
});
