-- Admin checkpoints are accessed exclusively through authenticated server routes.
ALTER TABLE "AdminUsersViewState" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "AdminUsersViewState" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "AdminUsersViewState" FROM authenticated;
  END IF;
END $$;
