import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateReferralCommission, normalizeReferralCode, referralDeadline, referralInputSchema } from "../../lib/referrals/rules";

const signup = new Date("2026-01-31T10:30:00Z");
const base = { creatorId: "11111111-1111-4111-8111-111111111111", percentage: 10 };
test("commission uses the amount actually paid, with deterministic integer rounding", () => {
  assert.equal(calculateReferralCommission(50000, 10), 5000);
  assert.equal(calculateReferralCommission(45000, 10), 4500);
  assert.equal(calculateReferralCommission(105, 10), 11);
  assert.equal(calculateReferralCommission(2147483647, 100), 2147483647);
});
test("invalid money and percentage values cannot produce commissions", () => {
  for (const value of [NaN, Infinity, -1, 0, 1.5]) assert.throws(() => calculateReferralCommission(value, 10));
  for (const percentage of [-1, 0, 101, NaN, 1.5]) assert.throws(() => calculateReferralCommission(1000, percentage));
});
test("calendar months preserve the signup time and clamp end-of-month dates", () => {
  assert.equal(referralDeadline(signup, { duration: "months", months: 1, windowDays: null, rechargeBefore: null })?.toISOString(), "2026-02-28T10:30:00.000Z");
  assert.equal(referralDeadline(signup, { duration: "months", months: 2, windowDays: null, rechargeBefore: null })?.toISOString(), "2026-03-31T10:30:00.000Z");
});
test("relative signup windows and absolute cutoffs have distinct deadlines", () => {
  assert.equal(referralDeadline(signup, { duration: "signup_window", months: null, windowDays: 7, rechargeBefore: null })?.toISOString(), "2026-02-07T10:30:00.000Z");
  const cutoff = new Date("2026-03-01T00:00:00Z");
  assert.equal(referralDeadline(signup, { duration: "signup_window", months: null, windowDays: null, rechargeBefore: cutoff }), cutoff);
});
test("indefinite and first-recharge modes do not invent an expiration", () => {
  for (const duration of ["indefinite", "first_recharge"]) assert.equal(referralDeadline(signup, { duration, months: null, windowDays: null, rechargeBefore: null }), null);
});
test("each admin duration requires exactly its intended parameters", () => {
  for (const duration of ["indefinite", "first_recharge"]) assert.equal(referralInputSchema.safeParse({ ...base, duration }).success, true);
  assert.equal(referralInputSchema.safeParse({ ...base, duration: "months", months: 12 }).success, true);
  assert.equal(referralInputSchema.safeParse({ ...base, duration: "months" }).success, false);
  assert.equal(referralInputSchema.safeParse({ ...base, duration: "months", months: 0 }).success, false);
  assert.equal(referralInputSchema.safeParse({ ...base, duration: "indefinite", months: 12 }).success, false);
  assert.equal(referralInputSchema.safeParse({ ...base, duration: "signup_window", windowDays: 30 }).success, true);
  assert.equal(referralInputSchema.safeParse({ ...base, duration: "signup_window", rechargeBefore: "2027-01-01T00:00:00Z" }).success, true);
  assert.equal(referralInputSchema.safeParse({ ...base, duration: "signup_window" }).success, false);
  assert.equal(referralInputSchema.safeParse({ ...base, duration: "signup_window", windowDays: 30, rechargeBefore: "2027-01-01T00:00:00Z" }).success, false);
});
test("referral codes cannot contain paths, query strings, or oversized payloads", () => {
  assert.equal(normalizeReferralCode("abcdefgh_1234-AB"), "abcdefgh_1234-AB");
  for (const value of [null, {}, "", "short", "../../abcdefgh", "abcdefgh?role=admin", "a".repeat(65)]) assert.equal(normalizeReferralCode(value), null);
});
