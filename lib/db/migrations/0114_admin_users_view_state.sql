CREATE TABLE IF NOT EXISTS "AdminUsersViewState" (
  "adminId" uuid PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "viewedThrough" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
-- Begin notifications at rollout, rather than treating existing accounts as unseen.
INSERT INTO "AdminUsersViewState" ("adminId", "viewedThrough")
SELECT "id", CURRENT_TIMESTAMP FROM "User" WHERE "role" = 'admin'
ON CONFLICT ("adminId") DO NOTHING;
