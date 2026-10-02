import assert from "node:assert/strict";
import { test } from "node:test";
import { combineCreatorRewards, formatCreatorRewards } from "../../lib/referrals/creator-summary";

test("summary boxes combine coupon and referral earnings without mixing currencies", () => {
  const referrals = [{ currency: "INR", earned: 1000, paid: 300, remaining: 700 }, { currency: "USD", earned: 500, paid: 100, remaining: 400 }];
  const combined = combineCreatorRewards(referrals, { totalRewardInPaise: 2000, totalPaidInPaise: 1000, remainingRewardInPaise: 1000 });
  assert.deepEqual(combined, [{ currency: "INR", earned: 3000, paid: 1300, remaining: 1700 }, { currency: "USD", earned: 500, paid: 100, remaining: 400 }]);
  assert.equal(referrals[0].earned, 1000);
  assert.match(formatCreatorRewards(combined, "earned"), /30\.00/);
  assert.match(formatCreatorRewards(combined, "earned"), /5\.00/);
});

test("unconfirmed totals stay unavailable instead of displaying false zero earnings", () => {
  assert.equal(combineCreatorRewards(null, { totalRewardInPaise: 0, totalPaidInPaise: 0, remainingRewardInPaise: 0 }), null);
  assert.equal(combineCreatorRewards([], null), null);
  assert.equal(formatCreatorRewards(null, "earned"), "—");
  assert.deepEqual(combineCreatorRewards([], { totalRewardInPaise: 0, totalPaidInPaise: 0, remainingRewardInPaise: 0 }), [{ currency: "INR", earned: 0, paid: 0, remaining: 0 }]);
});
