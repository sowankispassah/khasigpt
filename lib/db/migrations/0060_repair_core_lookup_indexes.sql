CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_idx"
ON public."User" (lower("email"));

CREATE INDEX IF NOT EXISTS "UserSubscription_user_status_expiresAt_idx"
ON public."UserSubscription" ("userId", "status", "expiresAt");

CREATE INDEX IF NOT EXISTS "UserSubscription_user_updatedAt_idx"
ON public."UserSubscription" ("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Chat_user_createdAt_active_idx"
ON public."Chat" ("userId", "createdAt")
WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Chat_user_mode_createdAt_active_idx"
ON public."Chat" ("userId", "mode", "createdAt")
WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Message_v2_chat_createdAt_idx"
ON public."Message_v2" ("chatId", "createdAt");

CREATE INDEX IF NOT EXISTS "Message_v2_chat_role_createdAt_idx"
ON public."Message_v2" ("chatId", "role", "createdAt");

CREATE INDEX IF NOT EXISTS "Vote_v2_messageId_idx"
ON public."Vote_v2" ("messageId");

CREATE INDEX IF NOT EXISTS "Stream_chat_createdAt_idx"
ON public."Stream" ("chatId", "createdAt");
