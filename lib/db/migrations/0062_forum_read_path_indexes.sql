CREATE INDEX IF NOT EXISTS "ForumCategory_position_name_idx"
ON public."ForumCategory" ("position", "name");

UPDATE public."ForumThread"
SET "lastRepliedAt" = "createdAt"
WHERE "lastRepliedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "ForumThread_activity_idx"
ON public."ForumThread" ("isPinned", "lastRepliedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "ForumThread_category_activity_idx"
ON public."ForumThread" ("categoryId", "isPinned", "lastRepliedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "ForumPost_thread_createdAt_idx"
ON public."ForumPost" ("threadId", "createdAt");

CREATE INDEX IF NOT EXISTS "ForumThreadTag_tag_thread_idx"
ON public."ForumThreadTag" ("tagId", "threadId");

CREATE INDEX IF NOT EXISTS "ForumThreadSubscription_user_thread_idx"
ON public."ForumThreadSubscription" ("userId", "threadId");

CREATE INDEX IF NOT EXISTS "ForumPostReaction_user_post_idx"
ON public."ForumPostReaction" ("userId", "postId");
