CREATE TABLE IF NOT EXISTS "ImpersonationToken" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" varchar(128) UNIQUE NOT NULL,
  "targetUserId" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE CASCADE,
  "createdByAdminId" uuid NOT NULL REFERENCES "public"."User"("id") ON DELETE CASCADE,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImpersonationToken_token_idx"
ON public."ImpersonationToken" ("token");

CREATE INDEX IF NOT EXISTS "ImpersonationToken_target_idx"
ON public."ImpersonationToken" ("targetUserId");

CREATE INDEX IF NOT EXISTS "ImpersonationToken_creator_idx"
ON public."ImpersonationToken" ("createdByAdminId");
