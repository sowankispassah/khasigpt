CREATE TABLE IF NOT EXISTS "LiveVoiceModelConfig" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(64) NOT NULL,
  "provider" "model_provider" NOT NULL,
  "providerModelId" varchar(128) NOT NULL,
  "displayName" varchar(128) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "systemInstruction" text DEFAULT '' NOT NULL,
  "voiceName" varchar(64) DEFAULT 'Zephyr' NOT NULL,
  "mediaResolution" varchar(64) DEFAULT 'MEDIA_RESOLUTION_MEDIUM' NOT NULL,
  "creditMultiplier" double precision DEFAULT 3 NOT NULL,
  "config" jsonb,
  "isEnabled" boolean DEFAULT true NOT NULL,
  "enabledOnWeb" boolean DEFAULT true NOT NULL,
  "enabledOnNative" boolean DEFAULT true NOT NULL,
  "isDefault" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  "deletedAt" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "LiveVoiceModelConfig_key_idx"
  ON "LiveVoiceModelConfig" ("key");

CREATE UNIQUE INDEX IF NOT EXISTS "LiveVoiceModelConfig_default_idx"
  ON "LiveVoiceModelConfig" ("isDefault")
  WHERE "isDefault" = true AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "LiveVoiceModelConfig_web_idx"
  ON "LiveVoiceModelConfig" ("isEnabled", "enabledOnWeb", "deletedAt");

CREATE INDEX IF NOT EXISTS "LiveVoiceModelConfig_native_idx"
  ON "LiveVoiceModelConfig" ("isEnabled", "enabledOnNative", "deletedAt");

ALTER TABLE "token_usage"
  ADD COLUMN IF NOT EXISTS "liveVoiceModelConfigId" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'token_usage'
      AND constraint_name = 'token_usage_live_voice_model_config_fk'
  ) THEN
    ALTER TABLE "token_usage"
      ADD CONSTRAINT "token_usage_live_voice_model_config_fk"
      FOREIGN KEY ("liveVoiceModelConfigId")
      REFERENCES "LiveVoiceModelConfig"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO "LiveVoiceModelConfig" (
  "key",
  "provider",
  "providerModelId",
  "displayName",
  "description",
  "systemInstruction",
  "voiceName",
  "mediaResolution",
  "creditMultiplier",
  "isEnabled",
  "enabledOnWeb",
  "enabledOnNative",
  "isDefault"
)
VALUES (
  'gemini-3-1-flash-live-preview',
  'google',
  'gemini-3.1-flash-live-preview',
  'Gemini 3.1 Flash Live Preview',
  'Realtime Gemini Live voice model for spoken chat.',
  '',
  'Zephyr',
  'MEDIA_RESOLUTION_MEDIUM',
  3,
  true,
  true,
  true,
  true
)
ON CONFLICT ("key") DO NOTHING;
