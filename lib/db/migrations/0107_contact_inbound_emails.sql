ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "lastInboundAt" timestamp;

CREATE INDEX IF NOT EXISTS "ContactMessage_kind_activityAt_idx"
  ON "ContactMessage" ("kind", (coalesce("lastInboundAt", "createdAt")) DESC);

CREATE TABLE IF NOT EXISTS "ContactMessageInboundEmail" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" uuid NOT NULL REFERENCES "ContactMessage"("id") ON DELETE CASCADE,
  "providerMessageId" varchar(512) NOT NULL UNIQUE,
  "senderEmail" varchar(128) NOT NULL,
  "subject" varchar(240) NOT NULL,
  "body" text NOT NULL,
  "receivedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ContactMessageInboundEmail_message_receivedAt_idx"
  ON "ContactMessageInboundEmail" ("messageId", "receivedAt");
