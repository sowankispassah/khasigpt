CREATE TABLE IF NOT EXISTS "ContactMessageStatusEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" uuid NOT NULL REFERENCES "ContactMessage"("id") ON DELETE CASCADE,
  "actorUserId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "fromStatus" contact_message_status NOT NULL,
  "toStatus" contact_message_status NOT NULL,
  "note" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ContactMessageStatusEvent_message_createdAt_idx"
  ON "ContactMessageStatusEvent" ("messageId", "createdAt");
