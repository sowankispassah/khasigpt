ALTER TABLE "public"."InviteToken"
ADD COLUMN IF NOT EXISTS "assignedToEmail" varchar(320);

CREATE INDEX IF NOT EXISTS "InviteToken_assignedToEmail_idx"
ON "public"."InviteToken" ("assignedToEmail");
