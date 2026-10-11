CREATE TABLE IF NOT EXISTS "ForumUserBlock" (
  "blockerId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "blockedId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ForumUserBlock_pkey" PRIMARY KEY ("blockerId", "blockedId"),
  CONSTRAINT "ForumUserBlock_no_self_block" CHECK ("blockerId" <> "blockedId")
);

CREATE INDEX IF NOT EXISTS "ForumUserBlock_blocked_idx"
  ON "ForumUserBlock" ("blockedId");
