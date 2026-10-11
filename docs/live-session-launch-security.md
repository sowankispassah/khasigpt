# Live voice and translation launch restriction

Direct live sessions connect from the client to the AI service and report usage
back to the app. That report is not trusted billing evidence. Until sessions have
server-controlled metering and spending limits, live voice and live translation
are restricted to active administrators on web and Android.

- All four token endpoints and all four session/turn save endpoints enforce a
  current active administrator before feature reads, normalization or provider
  work. Cookie roles are not sufficient. The lookup uses the existing auth-user
  primary key and has a 2.5-second deadline; lookup failure returns 503.
- Regular users receive 404 even with a per-user grant, an enabled setting or an
  old client. Anonymous requests remain unauthorized. No provider token is issued.
- Per-user grants cannot open a disabled live feature or give it to a regular
  user. A per-user block still blocks an administrator. Other features retain
  their existing override behavior.
- Chat controls, live translation pages, shortcuts and web/mobile feature read
  models use the same restriction. Cached client UI is not an authorization gate.
- Feature-read failures cannot fall back to public access. Existing active-admin
  feature checks, credit checks, token rate limits and token constraints remain.

This is launch containment, not trusted audio billing. Administrators can still
use the existing direct connection and client-reported billing. Do not enable
public live access until provider usage is received through a trusted server
session, costs are reserved atomically, active-session concurrency and input /
output / duration budgets are enforced, and reconciliation handles disconnects
or omitted client reports. Expiring a connection credential is not a spending cap.

No database migration or native API-shape change is required. Both current and
older installed clients are protected by the backend gate.
