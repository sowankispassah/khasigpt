import { expect, test } from "@playwright/test";
import { contactConversationEntrySchema } from "@/lib/contact/conversation-entry-input";
import { contactReplyHtml, contactReplySubject } from "@/lib/email/brevo";

test("contact conversation entry accepts private notes and rejects unrecognized delivery modes", () => {
  const input = {
    id: "875f2bd9-7020-41d3-a253-a72cab386e64",
    requestId: "975f2bd9-7020-41d3-a253-a72cab386e64",
    body: "  Follow up with billing.  ",
  };
  expect(contactConversationEntrySchema.parse({ ...input, kind: "internal_note" })).toMatchObject({
    body: "Follow up with billing.",
    kind: "internal_note",
  });
  expect(contactConversationEntrySchema.parse(input).kind).toBe("public_reply");
  expect(contactConversationEntrySchema.safeParse({ ...input, kind: "email_and_note" }).success).toBe(false);
});

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
