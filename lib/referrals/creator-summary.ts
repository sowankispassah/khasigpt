export type RewardBalance = { currency: string; earned: number; paid: number; remaining: number };
export type CouponRewardTotals = { totalRewardInPaise: number; totalPaidInPaise: number; remainingRewardInPaise: number };

export function combineCreatorRewards(referrals: RewardBalance[] | null, coupons: CouponRewardTotals | null): RewardBalance[] | null {
  if (!referrals || !coupons) return null;
  const balances = new Map(referrals.map(row => [row.currency, { ...row }]));
  const inr = balances.get("INR") ?? { currency: "INR", earned: 0, paid: 0, remaining: 0 };
  balances.set("INR", { currency: "INR", earned: inr.earned + coupons.totalRewardInPaise, paid: inr.paid + coupons.totalPaidInPaise, remaining: inr.remaining + coupons.remainingRewardInPaise });
  return [...balances.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function formatCreatorRewards(balances: RewardBalance[] | null | undefined, field: "earned" | "paid" | "remaining") {
  if (!balances) return "—";
  return balances.map(row => {
    try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: row.currency }).format(row[field] / 100); }
    catch { return `${row.currency} ${(row[field] / 100).toFixed(2)}`; }
  }).join(" · ");
}
