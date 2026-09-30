import { expect, test } from "@playwright/test";
import { isContactAccountSummary } from "@/lib/contact/account-summary";

const account = {
  id: "875f2bd9-7020-41d3-a253-a72cab386e64",
  email: "customer@example.com",
  firstName: "Khraw",
  lastName: "Kupar",
  role: "regular",
  authProvider: "credentials",
  isActive: true,
  emailVerificationPending: false,
  createdAt: "2026-09-01T10:00:00.000Z",
  subscription: { planName: "Standard", creditsRemaining: 125, expiresAt: "2026-10-01T10:00:00.000Z" },
  subscriptionUnavailable: false,
};

test("account sidebar accepts complete account data and rejects broken optional subscription fields", () => {
  expect(isContactAccountSummary(account)).toBe(true);
  expect(isContactAccountSummary({ ...account, subscription: null })).toBe(true);
  expect(isContactAccountSummary({ ...account, subscription: { ...account.subscription, creditsRemaining: "125" } })).toBe(false);
  expect(isContactAccountSummary({ ...account, role: "unknown" })).toBe(false);
  expect(isContactAccountSummary({ ...account, createdAt: "invalid" })).toBe(false);
});
