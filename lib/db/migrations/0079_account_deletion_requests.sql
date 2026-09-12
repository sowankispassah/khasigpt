DO $$ BEGIN
  CREATE TYPE "public"."account_deletion_request_status" AS ENUM (
    'pending',
    'under_review',
    'approved',
    'completed',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."account_deletion_reason" AS ENUM (
    'no_longer_using',
    'privacy_concerns',
    'duplicate_account',
    'prefer_not_to_say',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "AccountDeletionRequest" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "referenceId" varchar(32) NOT NULL,
  "userId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "email" varchar(128) NOT NULL,
  "fullName" varchar(128) NOT NULL,
  "usernameOrUserId" varchar(128),
  "reason" "account_deletion_reason" NOT NULL,
  "notes" text,
  "status" "account_deletion_request_status" NOT NULL DEFAULT 'pending',
  "requestSource" varchar(32) NOT NULL DEFAULT 'web',
  "verifiedAt" timestamp,
  "reviewedAt" timestamp,
  "reviewedByAdminId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "isViewed" boolean NOT NULL DEFAULT false,
  "viewedAt" timestamp,
  "viewedByAdminId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "approvedAt" timestamp,
  "approvedByAdminId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "completedAt" timestamp,
  "completedByAdminId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "rejectedAt" timestamp,
  "rejectedByAdminId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "internalNotes" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS "AccountDeletionRequest"
  ADD COLUMN IF NOT EXISTS "isViewed" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "viewedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "viewedByAdminId" uuid REFERENCES "User"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "AccountDeletionVerificationToken" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "requestId" uuid NOT NULL REFERENCES "AccountDeletionRequest"("id") ON DELETE CASCADE,
  "tokenHash" varchar(64) NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "consumedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "AccountDeletionRequestEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "requestId" uuid NOT NULL REFERENCES "AccountDeletionRequest"("id") ON DELETE CASCADE,
  "actorUserId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "action" varchar(96) NOT NULL,
  "fromStatus" "account_deletion_request_status",
  "toStatus" "account_deletion_request_status",
  "note" text,
  "metadata" jsonb,
  "ipAddress" varchar(128),
  "userAgent" text,
  "device" varchar(64),
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountDeletionRequest_reference_idx"
  ON "AccountDeletionRequest" ("referenceId");

CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_user_createdAt_idx"
  ON "AccountDeletionRequest" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_email_createdAt_idx"
  ON "AccountDeletionRequest" ("email", "createdAt");

CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_status_createdAt_idx"
  ON "AccountDeletionRequest" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_viewed_createdAt_idx"
  ON "AccountDeletionRequest" ("isViewed", "createdAt");

CREATE INDEX IF NOT EXISTS "AccountDeletionRequest_createdAt_idx"
  ON "AccountDeletionRequest" ("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AccountDeletionVerificationToken_token_hash_idx"
  ON "AccountDeletionVerificationToken" ("tokenHash");

CREATE INDEX IF NOT EXISTS "AccountDeletionVerificationToken_request_idx"
  ON "AccountDeletionVerificationToken" ("requestId");

CREATE INDEX IF NOT EXISTS "AccountDeletionVerificationToken_expiresAt_idx"
  ON "AccountDeletionVerificationToken" ("expiresAt");

CREATE INDEX IF NOT EXISTS "AccountDeletionRequestEvent_request_createdAt_idx"
  ON "AccountDeletionRequestEvent" ("requestId", "createdAt");

CREATE INDEX IF NOT EXISTS "AccountDeletionRequestEvent_actor_createdAt_idx"
  ON "AccountDeletionRequestEvent" ("actorUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "AccountDeletionRequestEvent_action_createdAt_idx"
  ON "AccountDeletionRequestEvent" ("action", "createdAt");
