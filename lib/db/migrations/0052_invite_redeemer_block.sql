CREATE TABLE IF NOT EXISTS "public"."InviteRedeemerBlock" (
  "inviteId" uuid NOT NULL REFERENCES "public"."InviteToken"("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE CASCADE,
  "blockedAt" timestamp NOT NULL DEFAULT now(),
  "blockedByAdminId" uuid REFERENCES "public"."User"("id") ON DELETE SET NULL,
  PRIMARY KEY ("inviteId", "userId")
);

CREATE INDEX IF NOT EXISTS "InviteRedeemerBlock_user_idx"
ON "public"."InviteRedeemerBlock" ("userId");

CREATE INDEX IF NOT EXISTS "InviteRedeemerBlock_blockedAt_idx"
ON "public"."InviteRedeemerBlock" ("blockedAt");
