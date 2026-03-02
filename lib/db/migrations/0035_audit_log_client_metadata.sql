ALTER TABLE "AuditLog"
ADD COLUMN IF NOT EXISTS "subjectUserId" uuid REFERENCES "public"."User"("id") ON DELETE SET NULL;

ALTER TABLE "AuditLog"
ADD COLUMN IF NOT EXISTS "ipAddress" varchar(128);

ALTER TABLE "AuditLog"
ADD COLUMN IF NOT EXISTS "userAgent" text;

ALTER TABLE "AuditLog"
ADD COLUMN IF NOT EXISTS "device" varchar(64);

CREATE INDEX IF NOT EXISTS "AuditLog_subjectUser_idx" ON public."AuditLog" ("subjectUserId");
CREATE INDEX IF NOT EXISTS "AuditLog_actor_idx" ON public."AuditLog" ("actorId");
