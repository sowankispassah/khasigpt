ALTER TABLE "ContactMessageReply"
  ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL DEFAULT 'public_reply';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ContactMessageReply_kind_check'
  ) THEN
    ALTER TABLE "ContactMessageReply"
      ADD CONSTRAINT "ContactMessageReply_kind_check"
      CHECK ("kind" IN ('public_reply', 'internal_note'));
  END IF;
END $$;
