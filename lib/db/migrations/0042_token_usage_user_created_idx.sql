CREATE INDEX IF NOT EXISTS "token_usage_user_created_idx"
ON public."token_usage" ("userId", "createdAt");
