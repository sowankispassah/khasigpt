# Password changes revoke existing sessions

`User.sessionVersion` is a non-null integer with default zero. Every password
write increments it in the same transaction as the password hash update. All
outstanding reset links are deleted in that transaction. Reset confirmation
locks the user, rechecks the reset token and expiry after acquiring the lock,
and consumes the links atomically; concurrent confirmations cannot reuse one
link to overwrite a winning password.

Browser JWTs and native access/handoff tokens capture the credential version
from the trusted sign-in lookup. Validation compares that original version with
a fresh primary-key auth-pool lookup. Cookie profile refresh and client session
updates never adopt a newer credential version. Shared API auth, admin API
authorization, administrator actions, public session-role checks and native
token exchange all enforce the version. The check prevents use on subsequent
requests; it does not cancel requests or live provider sessions already running.

Legacy signed browser cookies and native access tokens without a version remain
version zero. They work until the account changes its password for the first
time under this release. Existing sessions are not upgraded to the current
version. A prior password change before this migration cannot be retroactively
dated; users recovering a previously compromised account must reset again.

Signed-in password changes require the current password, matching replacements
of 8 to 72 UTF-8 bytes, and a shared per-account attempt limit. Conditional
updates protect against concurrent changes. Accounts without a password use the
existing email recovery flow instead of accepting an empty current password.
Web and Android clear password inputs and return to sign-in after success.
The existing API denies older clients that omit the current password; Android
version 206 includes the updated form and translated recovery errors.

Native access and OAuth handoff purposes are distinct. Handoff/preview tokens
cannot authenticate as access tokens. Handoff and cookie-to-native exchanges
must validate the original version before minting an access token. Separate
single-use OAuth handoff storage was completed by the subsequent
[handoff remediation](mobile-oauth-handoff-security.md).

Auth database failure denies privileged work. The browser session endpoint
returns 503 without expiring the existing cookie, and server auth callers throw
a retryable auth error. Native session validation returns 503, preserving the
existing startup outage behavior. Confirmed version mismatch returns an invalid
session and native 401. Auth critical work stays independent of optional profile,
billing, settings and translation hydration.

## Verification

- `password-session-security.test.ts`: signed token purpose/version validation,
  legacy compatibility, client refresh resistance, deleted/inactive users, and
  temporary database failure handling.
- `password-session-http.test.ts`: actual production-build credential login,
  multiple browser/native sessions, missing/wrong current passwords, revocation,
  old-token cookie and OAuth exchange attempts, concurrent password changes,
  single-use concurrent reset, expired reset, and database lock/outage recovery.
- Admin action regressions cover revoked credential versions for all exports.
- Native `password-change.test.mjs` executes the actual profile handler for
  current-password submission, secret clearing, successful sign-out and
  translated errors without sign-out on failed updates.
- Chrome uses a named disposable local account to observe revocation and
  subsequent login; no production user's password is changed for testing.

Migration: `0117_password_session_version.sql`, applied with `pnpm db:migrate`.
The column adds no new table, policy or public permission. Lookups use the
existing `User` primary key; token lookups use the unique reset-token index.

Do not roll back the enforcement code to a release that ignores session versions
after a password has been changed; that would resurrect old signed credentials.
Prefer a forward fix while retaining the additive column and version checks.

Security rationale follows the [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
and [password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
