UPDATE public."ForumThread"
SET "lastRepliedAt" = "createdAt"
WHERE "lastRepliedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "ForumThread_activity_cursor_idx"
ON public."ForumThread" (
  "isPinned",
  (COALESCE("lastRepliedAt", "createdAt")),
  "id"
);

CREATE INDEX IF NOT EXISTS "ForumThread_category_activity_cursor_idx"
ON public."ForumThread" (
  "categoryId",
  "isPinned",
  (COALESCE("lastRepliedAt", "createdAt")),
  "id"
);
