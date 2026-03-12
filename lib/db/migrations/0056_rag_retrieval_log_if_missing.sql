CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "RagRetrievalLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ragEntryId" uuid NOT NULL REFERENCES "RagEntry"("id") ON DELETE CASCADE,
  "chatId" uuid REFERENCES "Chat"("id") ON DELETE CASCADE,
  "modelConfigId" uuid REFERENCES "ModelConfig"("id") ON DELETE SET NULL,
  "modelKey" text NOT NULL,
  "userId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "score" double precision NOT NULL DEFAULT 0,
  "queryText" text NOT NULL,
  "queryLanguage" varchar(16),
  "applied" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "RagRetrievalLog_entry_idx"
ON "RagRetrievalLog" ("ragEntryId");

CREATE INDEX IF NOT EXISTS "RagRetrievalLog_model_idx"
ON "RagRetrievalLog" ("modelKey");

CREATE INDEX IF NOT EXISTS "RagRetrievalLog_createdAt_idx"
ON "RagRetrievalLog" ("createdAt");
