CREATE INDEX IF NOT EXISTS "token_usage_created_idx"
  ON "token_usage" ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "token_usage_model_created_idx"
  ON "token_usage" ("modelConfigId", "createdAt" DESC)
  WHERE "modelConfigId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "token_usage_live_voice_model_created_idx"
  ON "token_usage" ("liveVoiceModelConfigId", "createdAt" DESC)
  WHERE "liveVoiceModelConfigId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "PaymentTransaction_status_createdAt_idx"
  ON "PaymentTransaction" ("status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "PaymentTransaction_user_status_createdAt_idx"
  ON "PaymentTransaction" ("userId", "status", "createdAt" DESC);
