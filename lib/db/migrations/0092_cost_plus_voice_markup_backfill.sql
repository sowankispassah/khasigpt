UPDATE "LiveVoiceModelConfig"
SET "markupMultiplier" = LEAST(20, GREATEST(1, "creditMultiplier"))
WHERE "creditMultiplier" IS NOT NULL
  AND "markupMultiplier" = 3;
