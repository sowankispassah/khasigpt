import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { parseRazorpayPaymentEvent } from "@/lib/payments/razorpay-webhook";
import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "@/lib/security/csp";
import { proxy, SITE_STATUS_TIMINGS } from "@/proxy";

const env = process.env as Record<string, string | undefined>;

async function withProductionEnv<T>(run: () => Promise<T> | T) {
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    return await run();
  } finally {
    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  }
}

function scriptNonce(policy: string | null) {
  return policy?.match(/'nonce-([^']+)'/)?.[1] ?? null;
}

test.describe("content security policy", () => {
  test("pages get a fresh random nonce; API responses get no nonce", async () => {
    await withProductionEnv(() => {
      const first = createCspNonce();
      const second = createCspNonce();
      expect(first).not.toBe(second);
      expect(Buffer.from(first, "base64")).toHaveLength(16);

      const pagePolicy = buildContentSecurityPolicy(first);
      expect(pagePolicy).toContain(`'nonce-${first}'`);
      expect(pagePolicy).toContain("'strict-dynamic'");
      expect(pagePolicy).not.toContain("__NEXT_SCRIPT_NONCE__");
      expect(pagePolicy).not.toContain("'unsafe-inline' blob:");

      const apiPolicy = buildContentSecurityPolicy();
      expect(apiPolicy).not.toContain("'nonce-");
      expect(apiPolicy).not.toContain("'strict-dynamic'");
      expect(apiPolicy).toContain("frame-ancestors 'none'");
    });
  });

  test("proxy forwards the same per-request policy to rendering and the browser", async () => {
    await withProductionEnv(async () => {
      const nonces = new Set<string>();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await proxy(
          new NextRequest("http://localhost/privacy-policy", {
            headers: { accept: "text/html" },
          })
        );
        const sent = response.headers.get("content-security-policy");
        const forwarded = response.headers.get(
          "x-middleware-request-content-security-policy"
        );
        expect(response.headers.get("x-middleware-next")).toBe("1");
        expect(forwarded).toBe(sent);
        const nonce = scriptNonce(sent);
        expect(nonce).toBeTruthy();
        nonces.add(nonce as string);
      }
      expect(nonces.size).toBe(2);
    });
  });

  test("next.config no longer ships a fixed page nonce", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).not.toContain("__NEXT_SCRIPT_NONCE__");
    expect(config).toContain('source: "/api/:path*"');
  });
});

test("site status keeps last-known state well past the cache window", () => {
  expect(SITE_STATUS_TIMINGS.staleGraceMs).toBeGreaterThan(
    SITE_STATUS_TIMINGS.cacheWindowMs * 10
  );
  expect(SITE_STATUS_TIMINGS.coldReadTimeoutMs).toBeGreaterThan(
    SITE_STATUS_TIMINGS.warmReadTimeoutMs
  );
});

test.describe("razorpay webhook", () => {
  const secret = "webhook-test-secret";
  const sign = (body: string) =>
    createHmac("sha256", secret).update(body).digest("hex");

  test("accepts only bodies signed with the webhook secret", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const signature = sign(body);
    expect(verifyWebhookSignature({ body, secret, signature })).toBe(true);
    expect(
      verifyWebhookSignature({ body, secret, signature: signature.toUpperCase() })
    ).toBe(true);
    expect(
      verifyWebhookSignature({ body: `${body} `, secret, signature })
    ).toBe(false);
    expect(
      verifyWebhookSignature({ body, secret: "other-secret", signature })
    ).toBe(false);
    expect(verifyWebhookSignature({ body, secret, signature: null })).toBe(false);
    expect(verifyWebhookSignature({ body, secret, signature: "abc" })).toBe(false);
  });

  const payment = {
    id: "pay_Abc123",
    order_id: "order_Xyz789",
    amount: 49_900,
    currency: "INR",
    status: "captured",
  };

  test("extracts captured payments and paid orders", () => {
    expect(
      parseRazorpayPaymentEvent({
        event: "payment.captured",
        payload: { payment: { entity: payment } },
      })
    ).toEqual({
      event: "payment.captured",
      orderId: "order_Xyz789",
      paymentId: "pay_Abc123",
      amount: 49_900,
      currency: "INR",
    });

    expect(
      parseRazorpayPaymentEvent({
        event: "order.paid",
        payload: {
          payment: { entity: payment },
          order: {
            entity: {
              id: "order_Xyz789",
              amount: 49_900,
              currency: "INR",
              status: "paid",
            },
          },
        },
      })
    ).toMatchObject({ event: "order.paid", orderId: "order_Xyz789", amount: 49_900 });
  });

  test("ignores unrelated, incomplete and malformed events", () => {
    for (const body of [
      null,
      "payment.captured",
      { event: "payment.failed", payload: { payment: { entity: payment } } },
      { event: "payment.captured", payload: {} },
      {
        event: "payment.captured",
        payload: { payment: { entity: { ...payment, status: "authorized" } } },
      },
      {
        event: "order.paid",
        payload: {
          payment: { entity: payment },
          order: { entity: { id: "order_Xyz789", amount: 1, currency: "INR", status: "attempted" } },
        },
      },
      {
        event: "payment.captured",
        payload: { payment: { entity: { ...payment, order_id: "order_x'; drop" } } },
      },
      {
        event: "payment.captured",
        payload: { payment: { entity: { ...payment, amount: "49900" } } },
      },
    ]) {
      expect(parseRazorpayPaymentEvent(body)).toBeNull();
    }
  });
});
