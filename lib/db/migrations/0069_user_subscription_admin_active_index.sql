CREATE INDEX IF NOT EXISTS "UserSubscription_status_updatedAt_idx"
ON public."UserSubscription" ("status", "updatedAt" DESC)
WHERE "tokenBalance" > 0;
