# Launch firewall configuration

Published through the Vercel dashboard for `khasigpt` on 6 October 2026. These are project firewall settings, not application middleware or `vercel.json` routing rules. Updating this document does not apply rules; use Firewall → Rules → Review Changes → Publish.

## Active controls

- Vercel automatic DDoS mitigation remains active. There are no system bypasses.
- **KhasiGPT dynamic request flood limit**, ID `rule_khasi_gpt_dynamic_request_flood_limit_aWlJYb`: fixed window, 180 matching requests per 60 seconds, counted by IP Address only, then HTTP 429. No persistent ban or JavaScript challenge.
- **KhasiGPT scanner and secret-path block**, ID `rule_khasi_gpt_scanner_and_secret_path_block_2JSxOJ`: deny the request-path expression below. Both custom rules are enabled.
- Managed Bot Protection is **Log**. This records matching traffic; it does not block it. Managed AI Bots remains **Allow**, and Attack Mode remains off.

The limiter uses OR between the following two groups, and AND within each group:

| Group | Conditions |
| --- | --- |
| API requests | Path starts with `/api/`; path does not start with `/api/cron/`; path does not start with `/api/webhooks/`; method does not equal `OPTIONS` |
| Page/API writes | Method is any of `POST`, `PUT`, `PATCH`, `DELETE`; path does not start with `/api/cron/`; path does not start with `/api/webhooks/` |

Both groups feed the same IP counter. Matching only request path/method keeps this protection before middleware. Page POSTs include Next.js Server Actions, which do not necessarily use `/api/` paths. Native clients receive ordinary HTTP responses instead of a browser-only challenge. Cron and webhooks retain their existing server authentication; excluding them from this rule grants no application access.

Scanner expression (Vercel operators are case insensitive):

```regex
(^|/)(?:\.env(?:\.[^/]*)?|\.git)(?:/|$)|^/(?:wp-admin(?:/|$)|wp-login\.php$|xmlrpc\.php$|phpmyadmin(?:/|$)|vendor/phpunit(?:/|$))
```

The listed scanner paths are unused by this app. This rule complements keeping secrets and repository files out of public build assets.

## Verification and limits

Before broad coverage, the same rate-limit rule was restricted to `/api/public/site-launch` with query parameter `khasigpt_waf_probe=launch-20261006`, at two requests per 60 seconds. Three sequential harmless GETs returned **200, 200, 429**; the third response carried `x-vercel-mitigated: deny`. The temporary query condition was removed when publishing the 180-request production rule. This established live edge enforcement without a traffic flood. It did not stress-test the production threshold or distributed attackers.

After publication, ordinary GETs to `/wp-login.php`, `/.git/config`, and `/.env` returned **403** with `x-vercel-mitigated: deny`. Chrome visibly displayed the Vercel block for `/wp-login.php`. The previous diagnostic URL returned **200**, confirming the restrictive temporary rule was removed.

An ordinary native-style `okhttp/4.12.0` GET to `/api/mobile/features` returned **200**. An unauthenticated native profile request and unauthenticated cron request returned the expected **401**, without edge mitigation. Browser CORS preflight to `/api/mobile/features` returned **204**, with the expected allowed origin. These checks establish ordinary HTTP compatibility, not a complete physical Android login test or authenticated webhook delivery.

In the user's signed-in Chrome after publication, a harmless real PDF upload completed and a new chat correctly returned its first three words, "KhasiGPT disposable document". Streaming finished and the composer became usable again. Screenshot proof is retained in the task's ignored `.codex-remote-attachments/` folder (`waf-normal-chat-chrome.png`, `waf-live-rules-chrome.png`, `waf-scanner-block-chrome.png`). One ordinary live AI response was generated; no production load test or account/role/password change was performed.

The Firewall Overview subsequently showed System Mitigations Active, Custom Rules 2 active, and Bot Protection Logging. Rule totals included one rate-limit event, four scanner-path blocks and five bot-log events during the displayed past-day window, consistent with the verification traffic. Those counts do not establish a real attack. The dashboard showed no persistent bans and no active alerts.

Vercel tracks WAF counters per region. This is an additional edge ceiling, not a replacement for the shared Redis IP/account quotas, authentication, ownership checks, payload bounds, or billing reservations. Users sharing a public IP share this ceiling; review denied traffic and real launch usage before tuning it. Static asset and normal page GET requests do not consume this rule's counter. A botnet or many accounts can still spread usage across IPs; aggregate AI spending caps remain separate work.

The current Hobby plan permits one rate-limit rule and three total custom rules, with one million allowed rate-limit requests included. No plan upgrade, paid BotID integration or OWASP subscription was activated. Recheck entitlements and pricing before changing plans.

## Operations and rollback

Use the project's Firewall Overview/Traffic views to inspect rule matches, blocks and managed bot logs. This setup does not create an alerting integration or an ongoing monitoring automation. Bot logging may identify the native app as non-browser traffic; do not promote managed Bot Protection to blanket Challenge without solving native/webhook compatibility first. Do not create a broad `/api/` bypass: it can skip custom protection.

If legitimate clients hit the IP ceiling, adjust this rule's threshold and publish, using traffic evidence. For a false-positive scanner path, narrow its expression and publish. To roll back an individual custom rule, deactivate only that rule and publish; leave automatic DDoS mitigation and Redis enforcement active. These changes apply independently of application deployments. Attack Mode is an incident response control and requires separate assessment of native and automated-client effects.

References: [DDoS mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation), [rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), [rule configuration](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration), [bot management](https://vercel.com/docs/bot-management).
