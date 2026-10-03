import assert from "node:assert/strict";
import { test } from "node:test";
import { creatorPlayStoreUrl } from "../../lib/referrals/links";

test("referral links target KhasiGPT on Google Play and retain the exact creator code", () => {
  const code = "creator_123-ABC";
  const url = new URL(creatorPlayStoreUrl(code));
  assert.equal(url.origin, "https://play.google.com");
  assert.equal(url.pathname, "/store/apps/details");
  assert.equal(url.searchParams.get("id"), "khasigpt.com");
  assert.equal(new URLSearchParams(url.searchParams.get("referrer") ?? "").get("creator_referral"), code);
});

test("a referral code cannot inject Play Store query parameters", () => {
  const code = "creator&referrer=other&id=another.app";
  const url = new URL(creatorPlayStoreUrl(code));
  assert.equal(url.searchParams.getAll("id").length, 1);
  assert.equal(url.searchParams.getAll("referrer").length, 1);
  assert.equal(url.searchParams.get("id"), "khasigpt.com");
  assert.equal(url.searchParams.get("referrer"), `creator_referral=${code}`);
});
