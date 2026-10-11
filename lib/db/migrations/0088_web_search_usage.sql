CREATE TABLE IF NOT EXISTS "WebSearchUsage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "provider" varchar(64) NOT NULL,
  "platform" varchar(16) NOT NULL,
  "status" varchar(24) NOT NULL,
  "queryHash" varchar(64) NOT NULL,
  "triggerReason" varchar(256) NOT NULL,
  "searchCallCount" integer NOT NULL DEFAULT 0,
  "sourceCount" integer NOT NULL DEFAULT 0,
  "responseTimeMs" integer NOT NULL DEFAULT 0,
  "creditMultiplier" double precision NOT NULL DEFAULT 1,
  "creditCostTokens" integer NOT NULL DEFAULT 0,
  "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "errorReason" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "WebSearchUsage_user_createdAt_idx"
ON "WebSearchUsage" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "WebSearchUsage_chat_idx"
ON "WebSearchUsage" ("chatId");

CREATE INDEX IF NOT EXISTS "WebSearchUsage_createdAt_idx"
ON "WebSearchUsage" ("createdAt");

ALTER TABLE "WebSearchUsage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "WebSearchUsage" FROM anon, authenticated;
