CREATE TABLE IF NOT EXISTS "ImageModelConfig" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(64) UNIQUE NOT NULL,
  "provider" "model_provider" NOT NULL,
  "providerModelId" varchar(128) NOT NULL,
  "displayName" varchar(128) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "config" jsonb,
  "priceInPaise" integer NOT NULL DEFAULT 0,
  "tokensPerImage" integer NOT NULL DEFAULT 100,
  "isEnabled" boolean NOT NULL DEFAULT true,
  "isActive" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "deletedAt" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImageModelConfig_active_idx"
ON public."ImageModelConfig" ("isActive")
WHERE "isActive" = true;
