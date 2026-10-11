ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerificationPending" boolean NOT NULL DEFAULT false;

UPDATE "User" AS account
SET "emailVerificationPending" = true
WHERE account."authProvider" = 'credentials'
  AND account."isActive" = false
  AND EXISTS (
    SELECT 1 FROM "EmailVerificationToken" AS token
    WHERE token."userId" = account."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "AuditLog" AS audit
    WHERE audit."subjectUserId" = account."id"
      AND audit."action" IN ('user.login', 'user.active.update', 'user.account.deactivate')
  );
