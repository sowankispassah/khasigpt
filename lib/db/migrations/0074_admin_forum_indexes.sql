CREATE INDEX IF NOT EXISTS "ForumThread_updatedAt_idx"
ON public."ForumThread" ("updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "ForumThread_isLocked_idx"
ON public."ForumThread" ("isLocked");

CREATE INDEX IF NOT EXISTS "ForumPost_updatedAt_idx"
ON public."ForumPost" ("updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "ForumPost_isDeleted_idx"
ON public."ForumPost" ("isDeleted");

CREATE INDEX IF NOT EXISTS "ForumPost_isDeleted_updatedAt_idx"
ON public."ForumPost" ("isDeleted", "updatedAt" DESC);
