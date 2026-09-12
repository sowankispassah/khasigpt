CREATE TABLE IF NOT EXISTS "FreeChatUsageDaily" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "messageCount" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "FreeChatUsageDaily_user_day_idx"
ON "FreeChatUsageDaily" ("userId", "day");
