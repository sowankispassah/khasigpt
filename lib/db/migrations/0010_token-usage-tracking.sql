CREATE TABLE IF NOT EXISTS token_usage (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"chatId" uuid NOT NULL,
	"modelConfigId" uuid,
	"inputTokens" integer DEFAULT 0 NOT NULL,
	"outputTokens" integer DEFAULT 0 NOT NULL,
	"totalTokens" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT token_usage_user_fk FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE cascade,
	CONSTRAINT token_usage_chat_fk FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE cascade,
	CONSTRAINT token_usage_model_config_fk FOREIGN KEY ("modelConfigId") REFERENCES "ModelConfig"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS token_usage_user_idx ON token_usage ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS token_usage_chat_idx ON token_usage ("chatId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS token_usage_user_chat_idx ON token_usage ("userId","chatId");
