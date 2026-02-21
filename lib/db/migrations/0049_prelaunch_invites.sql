CREATE TABLE IF NOT EXISTS "InviteToken" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" varchar(128) UNIQUE NOT NULL,
  "label" varchar(160),
  "createdByAdminId" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE CASCADE,
  "maxRedemptions" integer NOT NULL DEFAULT 1,
  "expiresAt" timestamp,
  "revokedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "InviteToken_token_idx"
ON public."InviteToken" ("token");

CREATE INDEX IF NOT EXISTS "InviteToken_createdBy_idx"
ON public."InviteToken" ("createdByAdminId");

CREATE INDEX IF NOT EXISTS "InviteToken_createdAt_idx"
ON public."InviteToken" ("createdAt");

CREATE TABLE IF NOT EXISTS "InviteRedemption" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "inviteId" uuid NOT NULL REFERENCES "public"."InviteToken"("id") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE CASCADE,
  "redeemedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "InviteRedemption_invite_idx"
ON public."InviteRedemption" ("inviteId");

CREATE INDEX IF NOT EXISTS "InviteRedemption_user_idx"
ON public."InviteRedemption" ("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "InviteRedemption_invite_idx_unique"
ON public."InviteRedemption" ("inviteId");

CREATE UNIQUE INDEX IF NOT EXISTS "InviteRedemption_invite_user_idx"
ON public."InviteRedemption" ("inviteId", "userId");

CREATE TABLE IF NOT EXISTS "UserInviteAccess" (
  "userId" uuid PRIMARY KEY REFERENCES "public"."User"("id") ON DELETE CASCADE,
  "inviteId" uuid NOT NULL REFERENCES "public"."InviteToken"("id") ON DELETE CASCADE,
  "grantedAt" timestamp NOT NULL DEFAULT now(),
  "revokedAt" timestamp,
  "revokedByAdminId" uuid REFERENCES "public"."User"("id") ON DELETE SET NULL,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "UserInviteAccess_invite_idx"
ON public."UserInviteAccess" ("inviteId");

CREATE INDEX IF NOT EXISTS "UserInviteAccess_active_idx"
ON public."UserInviteAccess" ("userId", "inviteId")
WHERE "revokedAt" IS NULL;
