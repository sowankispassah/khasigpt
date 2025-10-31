DO $$
BEGIN
  CREATE TYPE contact_message_status AS ENUM (
    'new',
    'in_progress',
    'resolved',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ContactMessage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(128) NOT NULL,
  "email" varchar(128) NOT NULL,
  "phone" varchar(32),
  "subject" varchar(200) NOT NULL,
  "message" text NOT NULL,
  "status" contact_message_status NOT NULL DEFAULT 'new',
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ContactMessage_status_idx" ON "ContactMessage" ("status");
CREATE INDEX IF NOT EXISTS "ContactMessage_created_idx" ON "ContactMessage" ("createdAt");
