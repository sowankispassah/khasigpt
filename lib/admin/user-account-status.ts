export type AdminUserAccountStatusFilter =
  | "active"
  | "all"
  | "not_verified"
  | "suspended";

export function parseAdminUserAccountStatus(value: unknown): AdminUserAccountStatusFilter {
  if (value === "active" || value === "true" || value === "1") return "active";
  if (value === "suspended" || value === "inactive" || value === "false" || value === "0") return "suspended";
  if (value === "not_verified" || value === "unverified") return "not_verified";
  return "all";
}

export function getAdminUserStatus(user: {
  emailVerificationPending: boolean;
  isActive: boolean;
  isOnline: boolean;
}): "active" | "not_verified" | "online" | "suspended" {
  if (!user.isActive) return user.emailVerificationPending ? "not_verified" : "suspended";
  return user.isOnline ? "online" : "active";
}
