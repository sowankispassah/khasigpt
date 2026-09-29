import { expect, test } from "@playwright/test";
import { contactReplyHtml, contactReplySubject } from "@/lib/email/brevo";

test("reply subject strips header breaks and avoids repeated reply prefixes", () => {
  expect(contactReplySubject("Billing\r\nBcc: attacker@example.com")).toBe("Re: Billing Bcc: attacker@example.com");
  expect(contactReplySubject("Re: Billing")).toBe("Re: Billing");
});

test("contact reply HTML treats submitted text as text", () => {
  const html = contactReplyHtml('<script>alert("x")</script> & hello');
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&amp; hello");
});
