import { expect, test } from "@playwright/test";
import { getContactAccountAvatar, isContactAccountSummary } from "@/lib/contact/account-summary";

const account = {
  id: "875f2bd9-7020-41d3-a253-a72cab386e64",
  email: "customer@example.com",
  firstName: "Khraw",
  lastName: "Kupar",
  image: null,
  allowPersonalKnowledge: false,
  chatCount: 3,
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
  expect(isContactAccountSummary({ ...account, chatCount: null, subscriptionUnavailable: true, subscription: null })).toBe(true);
  expect(isContactAccountSummary({ ...account, allowPersonalKnowledge: "true" })).toBe(false);
  expect(isContactAccountSummary({ ...account, chatCount: -1 })).toBe(false);
});

test("contact avatar accepts stored photos and falls back for unsafe or missing sources", () => {
  expect(getContactAccountAvatar(null)).toBeNull();
  expect(getContactAccountAvatar("https://example.com/avatar.png")).toBe("https://example.com/avatar.png");
  expect(getContactAccountAvatar("/avatar.png")).toBe("/avatar.png");
  for (const image of ["javascript:alert(1)", "data:text/html,test", "//example.com/avatar.png", "/\\example.com/avatar.png", "https://user:pass@example.com/avatar.png"]) {
    expect(getContactAccountAvatar(image)).toBeNull();
  }
});
