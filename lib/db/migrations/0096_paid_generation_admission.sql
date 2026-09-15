CREATE TABLE IF NOT EXISTS "PaidGenerationLease" (
  "userId" uuid PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "ownerId" uuid NOT NULL,
  "expiresAt" timestamp NOT NULL
);
ALTER TABLE "PaidGenerationLease" ENABLE ROW LEVEL SECURITY;
