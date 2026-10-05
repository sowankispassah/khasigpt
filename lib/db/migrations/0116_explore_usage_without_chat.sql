-- Explore discovery and search usage must not require a sidebar conversation.
-- Real chats retain their foreign keys; standalone searches use a NULL chatId.
ALTER TABLE "token_usage" ALTER COLUMN "chatId" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "WebSearchUsage" ALTER COLUMN "chatId" DROP NOT NULL;
