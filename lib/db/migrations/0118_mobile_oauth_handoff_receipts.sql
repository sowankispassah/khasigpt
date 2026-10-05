CREATE TABLE IF NOT EXISTS "MobileOAuthHandoffReceipt" (
  "tokenHash" varchar(64) PRIMARY KEY NOT NULL,
  "expiresAt" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MobileOAuthHandoffReceipt_expiry_idx" ON "MobileOAuthHandoffReceipt" ("expiresAt");
--> statement-breakpoint
ALTER TABLE "MobileOAuthHandoffReceipt" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "MobileOAuthHandoffReceipt" FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "MobileOAuthHandoffReceipt" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "MobileOAuthHandoffReceipt" FROM authenticated;
  END IF;
END $$;
