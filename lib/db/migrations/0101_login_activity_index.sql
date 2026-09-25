CREATE INDEX IF NOT EXISTS "AuditLog_login_activity_createdAt_subject_idx"
ON public."AuditLog" ("createdAt", "subjectUserId")
WHERE "action" IN ('user.login', 'user.signup');
