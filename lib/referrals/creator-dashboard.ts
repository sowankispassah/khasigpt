import type { ReferralDashboard } from "./service";

// Allowlist the creator contract. Admin payout notes, recorder identities,
// payment order IDs and individual referred-user records stay server-side.
export function creatorReferralDashboard(data: ReferralDashboard, earningEnabled: boolean) {
  return {
    available: true,
    earningEnabled,
    page: data.page,
    totalCount: data.totalCount,
    referrals: data.referrals.map(row => ({
      id: row.id, code: row.code, percentage: row.percentage,
      duration: row.duration, months: row.months, windowDays: row.windowDays,
      rechargeBefore: row.rechargeBefore?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(), isActive: row.isActive,
      signups: row.signups,
      balances: row.balances.map(({ currency, earned, paid, remaining, recharges, revenue }) => ({ currency, earned, paid, remaining, recharges, revenue })),
    })),
  };
}

export type CreatorReferralDashboard = ReturnType<typeof creatorReferralDashboard>;
