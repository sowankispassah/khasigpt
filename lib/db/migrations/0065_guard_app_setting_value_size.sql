-- Repair the corrupted translate provider setting that could grow into a
-- multi-megabyte recursively escaped string and poison shared AppSetting reads.
UPDATE "AppSetting"
SET "value" = '"ai"'::jsonb,
    "updatedAt" = now()
WHERE "key" = 'chat.translate.providerMode'
  AND (
    "value" NOT IN ('"ai"'::jsonb, '"google"'::jsonb)
    OR octet_length("value"::text) > 128
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AppSetting_value_size_check'
  ) THEN
    ALTER TABLE "AppSetting"
      ADD CONSTRAINT "AppSetting_value_size_check"
      CHECK (octet_length("value"::text) <= 1048576)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AppSetting_translate_provider_mode_check'
  ) THEN
    ALTER TABLE "AppSetting"
      ADD CONSTRAINT "AppSetting_translate_provider_mode_check"
      CHECK (
        "key" <> 'chat.translate.providerMode'
        OR "value" IN ('"ai"'::jsonb, '"google"'::jsonb)
      )
      NOT VALID;
  END IF;
END $$;

ALTER TABLE "AppSetting"
  VALIDATE CONSTRAINT "AppSetting_value_size_check";

ALTER TABLE "AppSetting"
  VALIDATE CONSTRAINT "AppSetting_translate_provider_mode_check";
