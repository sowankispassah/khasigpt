import assert from "node:assert/strict";
import { test } from "node:test";
import { creatorReferralDashboard } from "../../lib/referrals/creator-dashboard";
import { referralCompactExpiry, referralCompactTerm, referralDate, referralExpiry, referralStatus } from "../../lib/referrals/presentation";
import type { ReferralDashboard } from "../../lib/referrals/service";

test("creator response excludes admin payout notes, identities and payment records", () => {
  const input = {
    referrals: [{ id: "link1", code: "creator123", creatorId: "private-owner", creatorName: "Private name", percentage: 5, duration: "indefinite", months: null, windowDays: null, rechargeBefore: null, createdAt: new Date("2026-10-01T00:00:00Z"), isActive: true, signups: 2, balances: [{ currency: "INR", earned: 500, paid: 100, remaining: 400, recharges: 2, revenue: 10000 }] }],
    recentPayouts: [{ note: "private-bank-reference", recordedBy: "private-admin" }],
    recentCommissions: [{ orderId: "private-order", userId: "private-user" }], page: 1, totalCount: 1,
  } as unknown as ReferralDashboard;
  const output = creatorReferralDashboard(input, false);
  assert.equal(output.referrals.length, 1);
  assert.equal(output.earningEnabled, false);
  assert.equal(output.referrals[0].createdAt, "2026-10-01T00:00:00.000Z");
  assert.equal(output.referrals[0].balances[0].remaining, 400);
  assert.doesNotMatch(JSON.stringify(output), /private-|creatorId|creatorName|recentPayouts|recentCommissions|orderId|recordedBy/);
});

test("expiry describes signup-relative terms without inventing a single link deadline", () => {
  const rule = { duration: "months", months: 3, windowDays: null, rechargeBefore: null };
  assert.deepEqual(referralExpiry(rule), { key: "months_display", values: { count: 3 } });
  assert.deepEqual(referralExpiry({ ...rule, duration: "signup_window", months: null, windowDays: 14 }), { key: "days_display", values: { count: 14 } });
  assert.equal(referralExpiry({ ...rule, duration: "first_recharge" }).key, "users_first_recharge");
  assert.equal(referralExpiry({ ...rule, duration: "indefinite" }).key, "no_expiry");
});

test("cutoffs display in IST and link status respects inactive and expired records", () => {
  const row = { isActive: true, rechargeBefore: "2026-10-02T00:00:00Z" };
  assert.equal(referralStatus(row, Date.parse("2026-10-03T00:00:00Z")), "expired");
  assert.equal(referralStatus({ ...row, isActive: false }), "inactive");
  assert.equal(referralStatus({ ...row, rechargeBefore: null }), "active");
  assert.match(referralDate(row.rechargeBefore, true), /5:30/);
  assert.equal(referralDate("bad date"), "—");
});

test("compact labels keep relative expiry separate from a fixed link cutoff", () => {
  const row = { duration: "months", months: 3, windowDays: null, rechargeBefore: null };
  assert.deepEqual(referralCompactTerm(row), { key: "short_months", values: { count: 3 } });
  assert.equal(referralCompactExpiry(row).key, "per_user");
  assert.equal(referralCompactExpiry({ ...row, duration: "indefinite" }).key, "no_expiry");
  assert.equal(referralCompactExpiry({ ...row, rechargeBefore: "2026-12-01T00:00:00Z" }).values.value, "1 Dec 2026");
});
