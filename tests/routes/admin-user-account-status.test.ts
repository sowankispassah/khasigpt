import { expect, test } from "@playwright/test";
import { getAdminUserStatus, parseAdminUserAccountStatus } from "@/lib/admin/user-account-status";

test("admin status distinguishes unverified accounts from suspended accounts", () => {
  expect(getAdminUserStatus({ isActive: false, emailVerificationPending: true, isOnline: false })).toBe("not_verified");
  expect(getAdminUserStatus({ isActive: false, emailVerificationPending: false, isOnline: false })).toBe("suspended");
  expect(getAdminUserStatus({ isActive: false, emailVerificationPending: true, isOnline: true })).toBe("not_verified");
  expect(getAdminUserStatus({ isActive: true, emailVerificationPending: false, isOnline: true })).toBe("online");
});

test("admin status filter accepts new and bookmarked values", () => {
  expect(parseAdminUserAccountStatus("not_verified")).toBe("not_verified");
  expect(parseAdminUserAccountStatus("suspended")).toBe("suspended");
  expect(parseAdminUserAccountStatus("false")).toBe("suspended");
  expect(parseAdminUserAccountStatus("true")).toBe("active");
  expect(parseAdminUserAccountStatus("all")).toBe("all");
});
