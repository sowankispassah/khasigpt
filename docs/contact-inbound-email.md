# Contact email replies

Admin contact replies are sent through Brevo. Receiving a customer response requires Brevo inbound parsing and a receiving subdomain. Outbound transactional email delivery events do not contain the customer's reply.

## Production setup

1. Add `reply.khasigpt.com` as a domain in Brevo and verify it using the DNS records shown in its domain configuration. The parent domain being verified is insufficient for Brevo to accept a webhook on this subdomain. The receiving domain was created in the KhasiGPT Brevo account on 29 September 2026 and is awaiting DNS verification.

2. In the authoritative DNS zone for `khasigpt.com`, add Brevo's verification TXT record for host `reply` and the two DKIM CNAME records for hosts `brevo1._domainkey.reply` and `brevo2._domainkey.reply`. Use the values currently shown by Brevo for this domain. Also add these MX records for the **subdomain** `reply.khasigpt.com`:

   | Host | Priority | Destination |
   | --- | ---: | --- |
   | `reply` | 10 | `inbound1.sendinblue.com` |
   | `reply` | 20 | `inbound2.sendinblue.com` |

   Keep the existing root-domain DNS records. Confirm the new MX records resolve and Brevo reports the receiving domain active before switching the Reply-To address.

3. Generate a long random token. Add `BREVO_INBOUND_DOMAIN=reply.khasigpt.com` and `BREVO_INBOUND_WEBHOOK_TOKEN=<token>` to the Vercel production environment. Redeploy after setting them. Both variables must be present before contact replies use the new address. If a token is already set, reuse it; replacing it requires updating the Brevo webhook with the same new value.

4. Once Brevo reports the receiving domain active, create one Brevo inbound webhook through `POST https://api.brevo.com/v3/webhooks` with the existing API key:

   ```json
   {
     "type": "inbound",
     "events": ["inboundEmailProcessed"],
     "url": "https://khasigpt.com/api/webhooks/brevo/inbound-contact",
     "domain": "reply.khasigpt.com",
     "description": "KhasiGPT contact replies",
     "auth": { "type": "bearer", "token": "<same token>" }
   }
   ```

5. Send a fresh admin reply from `/admin/contacts`, inspect its Reply-To address (`contact+<request-id>@reply.khasigpt.com`), and reply from the customer's original email address. The incoming message should appear under **Email conversation**, put the contact at the top of the table, and mark it unread. A resolved or dismissed request reopens as **In review**.

Incoming mail is accepted only when its sender matches the contact request and its recipient contains that request's alias. The webhook requires bearer authentication, deduplicates by email Message-ID, stores the parsed reply as plain text, and does not fetch attachments.

Replies to messages sent **before** the new Reply-To address was enabled went to `sowankidev@gmail.com`. Those messages remain in that Gmail inbox and are not imported automatically.

Brevo setup reference: https://developers.brevo.com/docs/inbound-parse-webhooks
