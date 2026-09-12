CREATE INDEX IF NOT EXISTS "RagEntry_approvedBy_idx"
ON "RagEntry" ("approvedBy");

CREATE INDEX IF NOT EXISTS "RagRetrievalLog_chat_idx"
ON "RagRetrievalLog" ("chatId");

CREATE INDEX IF NOT EXISTS "RagRetrievalLog_modelConfig_idx"
ON "RagRetrievalLog" ("modelConfigId");

CREATE INDEX IF NOT EXISTS "RagRetrievalLog_user_idx"
ON "RagRetrievalLog" ("userId");

CREATE INDEX IF NOT EXISTS "RagSearchLog_chat_idx"
ON "RagSearchLog" ("chatId");

CREATE INDEX IF NOT EXISTS "RagSearchLog_modelConfig_idx"
ON "RagSearchLog" ("modelConfigId");
