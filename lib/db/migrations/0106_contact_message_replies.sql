CREATE TABLE IF NOT EXISTS "ContactMessageReply" (
  "id" uuid PRIMARY KEY,
  "messageId" uuid NOT NULL REFERENCES "ContactMessage"("id") ON DELETE CASCADE,
  "actorUserId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "recipientEmail" varchar(128) NOT NULL,
  "subject" varchar(240) NOT NULL,
  "body" text NOT NULL,
  "deliveryStatus" varchar(16) NOT NULL DEFAULT 'pending',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "sentAt" timestamp
);

CREATE INDEX IF NOT EXISTS "ContactMessageReply_message_createdAt_idx"
  ON "ContactMessageReply" ("messageId", "createdAt");
