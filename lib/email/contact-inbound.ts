import { z } from "zod";

const emailAddress = z.string().email().max(128);
const mailbox = z.object({ Address: emailAddress });
const inboundItem = z.object({
  MessageId: z.string().min(1).max(512),
  From: mailbox,
  To: z.array(mailbox).optional(),
  Recipients: z.array(z.union([mailbox, emailAddress])).optional(),
  Subject: z.string().max(1000).optional(),
  ExtractedMarkdownMessage: z.string().optional(),
  RawTextBody: z.string().optional(),
});

export type ParsedInboundContactEmail = {
  contactId: string;
  providerMessageId: string;
  senderEmail: string;
  subject: string;
  body: string;
};

export function contactInboundDomain() {
  const domain = process.env.BREVO_INBOUND_DOMAIN?.trim().toLowerCase();
  return domain && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
}

export function contactReplyAddress(contactId: string) {
  const domain = contactInboundDomain();
  return domain && contactInboundConfigured() ? `contact+${contactId}@${domain}` : null;
}

export function contactInboundConfigured() {
  return Boolean(contactInboundDomain() && process.env.BREVO_INBOUND_WEBHOOK_TOKEN);
}

export function parseInboundContactEmails(payload: unknown, domain: string): ParsedInboundContactEmail[] | null {
  const parsed = z.object({ items: z.array(inboundItem).min(1).max(50) }).safeParse(payload);
  if (!parsed.success) return null;
  const result: ParsedInboundContactEmail[] = [];
  for (const item of parsed.data.items) {
    const recipients = [
      ...(item.To ?? []).map((entry) => entry.Address),
      ...(item.Recipients ?? []).map((entry) => typeof entry === "string" ? entry : entry.Address),
    ];
    const alias = recipients.map((address) => address.toLowerCase())
      .find((address) => address.startsWith("contact+") && address.endsWith(`@${domain}`));
    const match = alias?.match(/^contact\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/);
    const body = (item.ExtractedMarkdownMessage?.trim() || item.RawTextBody?.trim() || "").slice(0, 10000);
    if (!match || !body) continue;
    result.push({
      contactId: match[1],
      providerMessageId: item.MessageId,
      senderEmail: item.From.Address.toLowerCase(),
      subject: (item.Subject?.replace(/[\r\n]+/g, " ").trim() || "Re: KhasiGPT enquiry").slice(0, 240),
      body,
    });
  }
  return result;
}
