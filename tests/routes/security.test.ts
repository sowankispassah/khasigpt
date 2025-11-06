import { Buffer } from "node:buffer";

import { expect, test } from "../fixtures";

test.describe("/api/billing/balance", () => {
  test("rejects unauthenticated access", async ({ request }) => {
    const response = await request.get("/api/billing/balance");

    expect(response.status()).toBe(401);

    const payload = await response.text();
    expect(payload).toBe("Unauthorized");
  });

  test("returns sanitized payload for authenticated users", async ({
    adaContext,
  }) => {
    const response = await adaContext.request.get("/api/billing/balance");

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const summary = await response.json();

    expect(typeof summary.tokensRemaining).toBe("number");
    expect(typeof summary.tokensTotal).toBe("number");
    expect(typeof summary.creditsRemaining).toBe("number");
    expect(typeof summary.creditsTotal).toBe("number");
    expect(["string", "object"]).toContain(typeof summary.expiresAt);
    expect(["string", "object"]).toContain(typeof summary.startedAt);
    expect(["object"]).toContain(typeof summary.plan);

    const allowedKeys = [
      "tokensRemaining",
      "tokensTotal",
      "creditsRemaining",
      "creditsTotal",
      "expiresAt",
      "startedAt",
      "plan",
    ];

    expect(Object.keys(summary).sort()).toEqual(allowedKeys.sort());
  });
});

test.describe("/api/profile/avatar", () => {
  test("requires authentication", async ({ request }) => {
    const response = await request.post("/api/profile/avatar", {
      multipart: {
        image: {
          name: "avatar.png",
          mimeType: "image/png",
          buffer: Buffer.from(""),
        },
      },
    });

    expect(response.status()).toBe(401);

    const payload = await response.json();
    expect(payload).toMatchObject({ code: "unauthorized:api" });
  });

  test("validates image content for authenticated users", async ({
    adaContext,
  }) => {
    const response = await adaContext.request.post("/api/profile/avatar", {
      multipart: {
        image: {
          name: "avatar.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("not-an-image"),
        },
      },
    });

    expect(response.status()).toBe(400);

    const payload = await response.json();
    expect(payload).toMatchObject({
      code: "bad_request:api",
      message: expect.stringContaining("Only PNG, JPG, or WEBP images"),
    });
  });
});
