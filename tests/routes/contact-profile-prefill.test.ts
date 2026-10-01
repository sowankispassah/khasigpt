import { expect, test } from "@playwright/test";
import { applyContactPrefill, getContactPrefill } from "@/lib/contact/profile-prefill";

test("contact details use current profile names and real emails, with optional phone", () => {
  expect(getContactPrefill({ name: "Old name", firstName: " Khraw ", lastName: " Kupar ", email: " reviewer@example.com ", phone: " +91 1234567890 " })).toEqual({ name: "Khraw Kupar", email: "reviewer@example.com", phone: "+91 1234567890" });
  expect(getContactPrefill({ name: " Reviewer ", email: "guest-123" })).toEqual({ name: "Reviewer", email: "", phone: "" });
  expect(getContactPrefill(null)).toEqual({ name: "", email: "", phone: "" });
});

test("late profile hydration preserves edited or deliberately cleared fields and message drafts", () => {
  const values = { name: "Custom name", email: "", phone: "", subject: "Help", message: "My draft" };
  const prefill = { name: "Account name", email: "account@example.com", phone: "+91 1234567890" };
  expect(applyContactPrefill(values, prefill, new Set(["name", "email"]))).toEqual({ ...values, phone: prefill.phone });
  expect(values.phone).toBe("");
  expect(applyContactPrefill(values, getContactPrefill(null), new Set(["name"]))).toBe(values);
});
