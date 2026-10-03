import type { AuthProvider, UserRole } from "@/lib/db/schema";

export type ContactAccountSummary = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  image: string | null;
  allowPersonalKnowledge: boolean;
  chatCount: number | null;
  role: UserRole;
  authProvider: AuthProvider;
  isActive: boolean;
  emailVerificationPending: boolean;
  createdAt: string;
  subscription: {
    planName: string | null;
    creditsRemaining: number;
    expiresAt: string;
  } | null;
  subscriptionUnavailable: boolean;
};

export function isContactAccountSummary(value: unknown): value is ContactAccountSummary {
  if (!value || typeof value !== "object") return false;
  const account = value as Record<string, unknown>;
  if (typeof account.id !== "string" || typeof account.email !== "string"
    || !["regular", "creator", "admin"].includes(String(account.role))
    || !["credentials", "google"].includes(String(account.authProvider))
    || typeof account.isActive !== "boolean"
    || typeof account.emailVerificationPending !== "boolean"
    || typeof account.allowPersonalKnowledge !== "boolean"
    || !(account.image === null || typeof account.image === "string")
    || !(account.chatCount === null || typeof account.chatCount === "number" && Number.isSafeInteger(account.chatCount) && account.chatCount >= 0)
    || typeof account.createdAt !== "string" || !Number.isFinite(Date.parse(account.createdAt))
    || !(account.firstName === null || typeof account.firstName === "string")
    || !(account.lastName === null || typeof account.lastName === "string")
    || typeof account.subscriptionUnavailable !== "boolean") return false;
  if (account.subscription === null) return true;
  if (!account.subscription || typeof account.subscription !== "object") return false;
  const subscription = account.subscription as Record<string, unknown>;
  return (subscription.planName === null || typeof subscription.planName === "string")
    && typeof subscription.creditsRemaining === "number" && Number.isFinite(subscription.creditsRemaining)
    && typeof subscription.expiresAt === "string" && Number.isFinite(Date.parse(subscription.expiresAt));
}

export function getContactAccountAvatar(image: string | null): string | null {
  if (!image) return null;
  if (image.startsWith("/") && !image.startsWith("//") && !image.includes("\\")) return image;
  try {
    const url = new URL(image);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
