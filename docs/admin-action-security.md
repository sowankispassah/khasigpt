# Current administrator checks for Server Actions

Admin mutation permissions must come from a current active account, rather than
the role cached in an existing session JWT. All exported mutations in the main
admin actions, translation actions and account-deletion actions use the shared
server-only `lib/security/admin-session.ts` guard.

The guard reads the cookie session within four seconds, rejects anonymous and
non-admin sessions, then confirms the current role and active status through
the existing auth database pool. This primary-key query selects only the account
ID, role and active status and has a 2.5-second deadline. No new query or index,
database migration, client API contract or native release is required.

Missing, revoked or inactive accounts and lookup errors or timeouts deny the
mutation before its database writes, file uploads, audit writes or cache
invalidation. The decision is not cached across actions. Existing callers retain
their forbidden error or redirect behavior. Diagnostic messages exclude raw
session, token and database errors.

Automated tests execute every exported action against denied session/account
states with side-effect spies, check successful actions in all three modules,
check revocation after a successful action and exercise real timeout deadlines.
Production-build HTTP and Chrome tests use disposable local accounts for role
revocation; production verification must not revoke the user's real account.

This change checks permission when each mutation begins. It does not add MFA,
invalidate all sessions after a password change, or cancel work already accepted
before a role was revoked. Those are separate security controls.
