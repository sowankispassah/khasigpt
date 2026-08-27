CREATE INDEX IF NOT EXISTS "User_createdAt_idx"
ON public."User" ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Chat_createdAt_idx"
ON public."Chat" ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"
ON public."AuditLog" ("createdAt" DESC);
