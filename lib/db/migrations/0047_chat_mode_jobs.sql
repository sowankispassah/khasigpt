UPDATE "Chat"
SET "mode" = 'default'
WHERE "mode" IS NULL OR "mode" NOT IN ('default', 'study', 'jobs');
