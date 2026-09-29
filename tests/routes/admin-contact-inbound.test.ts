import { expect, test } from "@playwright/test";
import { contactReplyAddress, parseInboundContactEmails } from "@/lib/email/contact-inbound";

const contactId = "875f2bd9-7020-41d3-a253-a72cab386e64";
const domain = "reply.khasigpt.com";

test("incoming mail is tied to the contact alias and stores the extracted response", () => {
  const parsed = parseInboundContactEmails({ items: [{
    MessageId: "<reply-1@example.com>",
    From: { Address: "Customer@Example.com" },
    To: [{ Address: `contact+${contactId}@${domain}` }],
    Subject: "Re: Billing",
    ExtractedMarkdownMessage: "I still need help.",
    RawTextBody: "I still need help.\n\nOn Tuesday, support wrote...",
  }] }, domain);
  expect(parsed).toEqual([{
    contactId,
    providerMessageId: "<reply-1@example.com>",
    senderEmail: "customer@example.com",
    subject: "Re: Billing",
    body: "I still need help.",
  }]);
});

test("unrelated addresses and empty replies are ignored", () => {
  const base = { MessageId: "<reply-2@example.com>", From: { Address: "customer@example.com" } };
  expect(parseInboundContactEmails({ items: [{ ...base, To: [{ Address: `contact+${contactId}@other.example.com` }], RawTextBody: "Hi" }] }, domain)).toEqual([]);
  expect(parseInboundContactEmails({ items: [{ ...base, To: [{ Address: `contact+${contactId}@${domain}` }], RawTextBody: "  " }] }, domain)).toEqual([]);
});

test("reply alias remains disabled until both inbound settings are configured", () => {
  const beforeDomain = process.env.BREVO_INBOUND_DOMAIN;
  const beforeToken = process.env.BREVO_INBOUND_WEBHOOK_TOKEN;
  try {
    process.env.BREVO_INBOUND_DOMAIN = domain;
    delete process.env.BREVO_INBOUND_WEBHOOK_TOKEN;
    expect(contactReplyAddress(contactId)).toBeNull();
    process.env.BREVO_INBOUND_WEBHOOK_TOKEN = "test-secret";
    expect(contactReplyAddress(contactId)).toBe(`contact+${contactId}@${domain}`);
  } finally {
    if (beforeDomain === undefined) delete process.env.BREVO_INBOUND_DOMAIN;
    else process.env.BREVO_INBOUND_DOMAIN = beforeDomain;
    if (beforeToken === undefined) delete process.env.BREVO_INBOUND_WEBHOOK_TOKEN;
    else process.env.BREVO_INBOUND_WEBHOOK_TOKEN = beforeToken;
  }
});
