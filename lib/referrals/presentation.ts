type ReferralTerm = { duration: string; months: number | null; windowDays: number | null; rechargeBefore: string | null };
type TermLabel = { key: string; values: Record<string, string | number> };

export function referralTerm(row: ReferralTerm): TermLabel {
  if (row.duration === "months") return { key: "months_display", values: { count: row.months ?? 0 } };
  if (row.duration === "signup_window" && row.windowDays) return { key: "days_display", values: { count: row.windowDays } };
  return { key: row.duration === "signup_window" ? "cutoff_display" : row.duration === "first_recharge" ? "users_first_recharge" : "indefinite", values: {} };
}

export function referralDate(value: string | null | undefined, includeTime = false) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", ...(includeTime ? { timeStyle: "short" as const } : {}), timeZone: "Asia/Kolkata" }).format(new Date(value));
}

export function referralExpiry(row: ReferralTerm): TermLabel {
  if (row.rechargeBefore) return { key: "expiry_at", values: { date: referralDate(row.rechargeBefore, true) } };
  if (row.duration === "months") return { key: "months_display", values: { count: row.months ?? 0 } };
  if (row.duration === "signup_window" && row.windowDays) return { key: "days_display", values: { count: row.windowDays } };
  return { key: row.duration === "first_recharge" ? "users_first_recharge" : "no_expiry", values: {} };
}

// Link status describes the assigned record. Program access is reported separately.
export function referralStatus(row: { isActive: boolean; rechargeBefore: string | null }, now = Date.now()) {
  if (!row.isActive) return "inactive";
  if (row.rechargeBefore && new Date(row.rechargeBefore).getTime() < now) return "expired";
  return "active";
}

export function referralCompactTerm(row: ReferralTerm): TermLabel {
  if (row.duration === "months") return { key: "short_months", values: { count: row.months ?? 0 } };
  if (row.duration === "signup_window" && row.windowDays) return { key: "short_days", values: { count: row.windowDays } };
  return { key: row.duration === "first_recharge" ? "short_first" : row.duration === "signup_window" ? "short_cutoff" : "short_indefinite", values: {} };
}

export function referralCompactExpiry(row: ReferralTerm): TermLabel {
  if (row.rechargeBefore) return { key: "rule_values", values: { value: referralDate(row.rechargeBefore) } };
  return { key: row.duration === "indefinite" ? "no_expiry" : "per_user", values: {} };
}
