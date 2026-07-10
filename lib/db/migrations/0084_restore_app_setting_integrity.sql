CREATE OR REPLACE FUNCTION _unwrap_app_setting_scalar(input_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  current_value jsonb := input_value;
  parsed_value jsonb;
  text_value text;
BEGIN
  FOR i IN 1..32 LOOP
    IF jsonb_typeof(current_value) <> 'string' THEN
      RETURN current_value;
    END IF;

    text_value := current_value #>> '{}';

    BEGIN
      parsed_value := text_value::jsonb;
    EXCEPTION WHEN others THEN
      RETURN to_jsonb(text_value);
    END;

    IF parsed_value = current_value THEN
      RETURN current_value;
    END IF;

    current_value := parsed_value;
  END LOOP;

  RETURN current_value;
END;
$$;

WITH normalized AS (
  SELECT
    "key",
    _unwrap_app_setting_scalar("value") AS unwrapped_value
  FROM "AppSetting"
  WHERE "key" IN (
    'calculator.enabled',
    'chat.documentUploads.enabled',
    'chat.iconPrompts.enabled',
    'image.generation.enabled',
    'chat.jobs.enabled',
    'chat.studyMode.enabled',
    'chat.suggestedPrompts.enabled',
    'chat.translate.enabled',
    'chat.voice.android.enabled',
    'chat.voice.enabled',
    'chat.voice.web.enabled',
    'chat.liveTranslation.android.enabled',
    'chat.liveTranslation.web.enabled'
  )
),
resolved AS (
  SELECT
    "key",
    CASE
      WHEN unwrapped_value IN ('true'::jsonb, '1'::jsonb)
        THEN to_jsonb('enabled'::text)
      WHEN unwrapped_value IN ('false'::jsonb, '0'::jsonb)
        THEN to_jsonb('disabled'::text)
      WHEN lower(unwrapped_value #>> '{}') IN (
        '1', 'true', 'yes', 'on', 'enabled', 'enable', 'all', 'public',
        'enabled_for_all'
      ) THEN to_jsonb('enabled'::text)
      WHEN lower(unwrapped_value #>> '{}') IN (
        '0', 'false', 'no', 'off', 'disabled', 'disable', 'none',
        'disabled_for_all'
      ) THEN to_jsonb('disabled'::text)
      WHEN replace(
        replace(lower(unwrapped_value #>> '{}'), '-', '_'),
        ' ',
        '_'
      ) IN ('admin', 'admins', 'admin_only', 'adminonly', 'admins_only')
        THEN to_jsonb('admin_only'::text)
      ELSE to_jsonb('admin_only'::text)
    END AS normalized_value
  FROM normalized
)
UPDATE "AppSetting" AS setting
SET
  "value" = resolved.normalized_value,
  "updatedAt" = now()
FROM resolved
WHERE setting."key" = resolved."key"
  AND setting."value" IS DISTINCT FROM resolved.normalized_value;

WITH normalized AS (
  SELECT
    "key",
    _unwrap_app_setting_scalar("value") AS unwrapped_value
  FROM "AppSetting"
  WHERE "key" IN (
    'chat.customKnowledge',
    'site.adminEntry.enabled',
    'site.prelaunch.inviteOnly',
    'site.publicLaunched',
    'site.underMaintenance'
  )
),
resolved AS (
  SELECT
    "key",
    CASE
      WHEN unwrapped_value = 'true'::jsonb
        OR lower(unwrapped_value #>> '{}') IN (
          '1', 'true', 'yes', 'on', 'enabled'
        ) THEN 'true'::jsonb
      ELSE 'false'::jsonb
    END AS normalized_value
  FROM normalized
)
UPDATE "AppSetting" AS setting
SET
  "value" = resolved.normalized_value,
  "updatedAt" = now()
FROM resolved
WHERE setting."key" = resolved."key"
  AND setting."value" IS DISTINCT FROM resolved.normalized_value;

UPDATE "AppSetting"
SET
  "value" = CASE
    WHEN lower(_unwrap_app_setting_scalar("value") #>> '{}') = 'google'
      THEN to_jsonb('google'::text)
    ELSE to_jsonb('ai'::text)
  END,
  "updatedAt" = now()
WHERE "key" = 'chat.translate.providerMode'
  AND "value" IS DISTINCT FROM CASE
    WHEN lower(_unwrap_app_setting_scalar("value") #>> '{}') = 'google'
      THEN to_jsonb('google'::text)
    ELSE to_jsonb('ai'::text)
  END;

DROP FUNCTION _unwrap_app_setting_scalar(jsonb);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AppSetting_value_size_check'
  ) THEN
    ALTER TABLE "AppSetting"
      ADD CONSTRAINT "AppSetting_value_size_check"
      CHECK (octet_length("value"::text) <= 1048576)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AppSetting_feature_access_scalar_check'
  ) THEN
    ALTER TABLE "AppSetting"
      ADD CONSTRAINT "AppSetting_feature_access_scalar_check"
      CHECK (
        "key" NOT IN (
          'calculator.enabled',
          'chat.documentUploads.enabled',
          'chat.iconPrompts.enabled',
          'image.generation.enabled',
          'chat.jobs.enabled',
          'chat.studyMode.enabled',
          'chat.suggestedPrompts.enabled',
          'chat.translate.enabled',
          'chat.voice.android.enabled',
          'chat.voice.enabled',
          'chat.voice.web.enabled',
          'chat.liveTranslation.android.enabled',
          'chat.liveTranslation.web.enabled'
        )
        OR "value" IN (
          '"enabled"'::jsonb,
          '"admin_only"'::jsonb,
          '"disabled"'::jsonb
        )
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AppSetting_boolean_scalar_check'
  ) THEN
    ALTER TABLE "AppSetting"
      ADD CONSTRAINT "AppSetting_boolean_scalar_check"
      CHECK (
        "key" NOT IN (
          'chat.customKnowledge',
          'site.adminEntry.enabled',
          'site.prelaunch.inviteOnly',
          'site.publicLaunched',
          'site.underMaintenance'
        )
        OR jsonb_typeof("value") = 'boolean'
      )
      NOT VALID;
  END IF;
END $$;

ALTER TABLE "AppSetting"
  VALIDATE CONSTRAINT "AppSetting_value_size_check";
ALTER TABLE "AppSetting"
  VALIDATE CONSTRAINT "AppSetting_translate_provider_mode_check";
ALTER TABLE "AppSetting"
  VALIDATE CONSTRAINT "AppSetting_feature_access_scalar_check";
ALTER TABLE "AppSetting"
  VALIDATE CONSTRAINT "AppSetting_boolean_scalar_check";
