import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "@playwright/test";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));

test("Next's patched image library encodes and decodes PNG and AVIF", async () => {
  const nextRequire = createRequire(requireModule.resolve("next/package.json"));
  const sharp = nextRequire("sharp");
  for (const format of ["png", "avif"] as const) {
    const encoded = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } })
      .toFormat(format).toBuffer();
    const metadata = await sharp(encoded).metadata();
    expect(metadata).toMatchObject({ width: 8, height: 8, format: format === "avif" ? "heif" : "png" });
    expect((await sharp(encoded).resize(4, 4).png().toBuffer()).byteLength).toBeGreaterThan(0);
  }
});

test("the patched AI download utility rejects private destinations before invoking a transport", async () => {
  const aiRequire = createRequire(requireModule.resolve("ai/package.json"));
  const { fetchWithValidatedEndpoint } = aiRequire("@ai-sdk/provider-utils");
  let transportCalls = 0;
  for (const url of ["http://127.0.0.1/private", "http://169.254.169.254/metadata", "http://[::1]/private", "http://localhost/private"]) {
    await expect(fetchWithValidatedEndpoint({
      url, fetch: async () => { transportCalls += 1; return new Response("private"); },
    })).rejects.toThrow(/not allowed/);
  }
  expect(transportCalls).toBe(0);
});
