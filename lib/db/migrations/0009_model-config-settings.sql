DO $$ BEGIN
 CREATE TYPE "public"."model_provider" AS ENUM('openai', 'anthropic', 'google', 'custom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ModelConfig" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"provider" "model_provider" NOT NULL,
	"providerModelId" varchar(128) NOT NULL,
	"displayName" varchar(128) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"systemPrompt" text,
	"codeTemplate" text,
	"supportsReasoning" boolean DEFAULT false NOT NULL,
	"reasoningTag" varchar(32),
	"config" jsonb,
	"isEnabled" boolean DEFAULT true NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ModelConfig_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;