import { expect, test } from "@playwright/test";

test("anonymous callers cannot read or mutate creator commissions", async ({ request }) => {
  const get = await request.get("/api/admin/referrals");
  expect(get.status()).toBe(403);
  const create = await request.post("/api/admin/referrals", { data: { creatorId: "11111111-1111-4111-8111-111111111111", percentage: 10, duration: "indefinite" } });
  expect(create.status()).toBe(403);
  const payout = await request.patch("/api/admin/referrals", { data: { action: "payout", amount: 10000 } });
  expect(payout.status()).toBe(403);
  const creator = await request.get("/api/creator/referrals");
  expect(creator.status()).toBe(403);
});
test("invalid referral links do not set an attribution cookie", async ({ request }) => {
  const response = await request.get("/api/referrals/start?code=short");
  expect(response.status()).toBe(400);
  expect(response.headers()["set-cookie"] ?? "").not.toContain("khasigpt_signup_referral");
});
test("coupon validation stays protected on web and Android", async ({ request }) => {
  for (const path of ["/api/billing/coupon/validate", "/api/mobile/billing/coupon/validate"]) {
    const response = await request.post(path, { data: { planId: "11111111-1111-4111-8111-111111111111", couponCode: "TEST" } });
    expect(response.status()).toBe(401);
  }
});
