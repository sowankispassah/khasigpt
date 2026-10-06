CREATE TABLE IF NOT EXISTS "LiveVoiceSession" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "modelConfigId" uuid NOT NULL REFERENCES "LiveVoiceModelConfig"("id"),
  "providerSessionId" text UNIQUE,
  "platform" varchar(16) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "pricing" jsonb NOT NULL,
  "billedSeconds" double precision NOT NULL DEFAULT 0,
  "observedSeconds" double precision NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LiveVoiceSession_user_status_idx" ON "LiveVoiceSession"("userId", "status", "createdAt");
--> statement-breakpoint
ALTER TABLE "LiveVoiceSession" ENABLE ROW LEVEL SECURITY;
