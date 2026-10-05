# Single-use mobile Google handoffs

The signed ten-minute Google handoff is a login credential. Its completion
endpoint atomically records a SHA-256 digest in `MobileOAuthHandoffReceipt`
while confirming the active user's current credential version. A primary-key
conflict denies all later exchanges, including simultaneous exchanges from
different application instances. No raw token, email, password or user ID is
stored in this table. A fresh random nonce prevents independent sign-ins in
the same millisecond from sharing a receipt; older signed handoffs are also
consumed once without requiring an Android protocol change. Exchanges completed
before this deployment have no historical receipt; older handoffs can be used
once under the new enforcement until their original ten-minute expiry.

The existing mobile access-token type check still rejects handoffs as API
credentials. Completed access tokens retain normal session-version checks.
Authenticated cookie-to-native conversion is a distinct authenticated session
operation and does not accept a Google handoff.

Invalid, expired, disabled-user, deleted-user and revoked-version handoffs do
not mint tokens or write a receipt. Database failures/timeouts deny exchange,
return the existing app error redirect and never fall back to local memory.
An uncertain timed-out write may have committed: restart Google sign-in rather
than reusing the link. The existing Android error screen can retry the entire
sign-in; no client update or new AAB is required for this backend change.

Expiry cleanup is indexed, deletes at most 100 rows per completion request and
skips locked rows. Receipts remain for at least one day after token expiry to
avoid reopening a consumed credential due to a small clock difference. No
traffic means no new receipts and no growing backlog. Cleanup is part of the
atomic statement; a failure denies the exchange.

Migration `0118_mobile_oauth_handoff_receipts.sql` creates the additive table
and expiry index, enables RLS with no client policies, and revokes PUBLIC,
anon and authenticated access. Use `pnpm db:migrate` before deployment. Do not
roll back to a completion endpoint that ignores these receipts: it would make
already-consumed handoffs reusable while their signed lifetime remains valid.
Retain the receipt table and prefer a forward fix. These credentials can still
be stolen and raced before their first use; single-use consumption does not
replace TLS, trusted redirect handling, OAuth state checks or device security.

`mobile-oauth-handoff-http.test.ts` exercises real production-built HTTP
requests on two server instances, a concurrent first-use race, subsequent
replay, a successful native session, purpose confusion, legacy handoffs,
revoked/inactive/missing users, expiry, storage outage/recovery and bounded
cleanup against the disposable loopback database.
