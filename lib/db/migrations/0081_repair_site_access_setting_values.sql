CREATE OR REPLACE FUNCTION _unwrap_app_setting_jsonb_string(input_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  current_value jsonb := input_value;
  parsed_value jsonb;
  text_value text;
BEGIN
  FOR i IN 1..8 LOOP
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

UPDATE "AppSetting"
SET
  "value" = _unwrap_app_setting_jsonb_string("value"),
  "updatedAt" = now()
WHERE "key" IN (
  'site.publicLaunched',
  'site.underMaintenance',
  'site.prelaunch.inviteOnly',
  'site.adminEntry.enabled'
)
AND jsonb_typeof("value") = 'string';

WITH legacy AS (
  SELECT lower(_unwrap_app_setting_jsonb_string("value") #>> '{}') AS mode
  FROM "AppSetting"
  WHERE "key" = 'site.launch.enabled'
  LIMIT 1
)
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
SELECT
  'site.publicLaunched',
  CASE WHEN mode IN ('enabled', 'true') THEN 'true'::jsonb ELSE 'false'::jsonb END,
  now()
FROM legacy
WHERE mode IN ('enabled', 'true', 'admin_only', 'disabled', 'false')
  AND NOT EXISTS (
    SELECT 1 FROM "AppSetting" WHERE "key" = 'site.publicLaunched'
  )
ON CONFLICT ("key") DO NOTHING;

WITH legacy AS (
  SELECT lower(_unwrap_app_setting_jsonb_string("value") #>> '{}') AS mode
  FROM "AppSetting"
  WHERE "key" = 'site.launch.enabled'
  LIMIT 1
)
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
SELECT 'site.adminEntry.enabled', 'true'::jsonb, now()
FROM legacy
WHERE mode = 'admin_only'
  AND NOT EXISTS (
    SELECT 1 FROM "AppSetting" WHERE "key" = 'site.adminEntry.enabled'
  )
ON CONFLICT ("key") DO NOTHING;

DROP FUNCTION _unwrap_app_setting_jsonb_string(jsonb);
