CREATE INDEX IF NOT EXISTS "Chat_active_createdAt_idx"
ON public."Chat" ("createdAt" DESC)
WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Chat_deleted_createdAt_idx"
ON public."Chat" ("createdAt" DESC)
WHERE "deletedAt" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "AuditLog_actor_createdAt_idx"
ON public."AuditLog" ("actorId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AuditLog_subjectUser_createdAt_idx"
ON public."AuditLog" ("subjectUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ContactMessage_status_createdAt_idx"
ON public."ContactMessage" ("status", "createdAt" DESC);
