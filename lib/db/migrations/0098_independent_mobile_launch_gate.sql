INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES (
  'site.mobileAppLaunched',
  COALESCE(
    (
      SELECT "value"
      FROM "AppSetting"
      WHERE "key" = 'site.publicLaunched'
        AND jsonb_typeof("value") = 'boolean'
      LIMIT 1
    ),
    (
      SELECT CASE
        WHEN lower(trim(both '"' from "value"::text)) IN ('enabled', 'true')
          THEN 'true'::jsonb
        ELSE 'false'::jsonb
      END
      FROM "AppSetting"
      WHERE "key" = 'site.launch.enabled'
      LIMIT 1
    ),
    'false'::jsonb
  ),
  now()
)
ON CONFLICT ("key") DO NOTHING;

UPDATE "AppSetting"
SET
  "value" = CASE
    WHEN "value" = 'true'::jsonb
      OR lower(trim(both '"' from "value"::text)) IN (
        '1', 'true', 'yes', 'on', 'enabled'
      ) THEN 'true'::jsonb
    ELSE 'false'::jsonb
  END,
  "updatedAt" = now()
WHERE "key" = 'site.mobileAppLaunched'
  AND jsonb_typeof("value") <> 'boolean';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AppSetting_mobile_launch_boolean_check'
  ) THEN
    ALTER TABLE "AppSetting"
      ADD CONSTRAINT "AppSetting_mobile_launch_boolean_check"
      CHECK (
        "key" <> 'site.mobileAppLaunched'
        OR jsonb_typeof("value") = 'boolean'
      )
      NOT VALID;
  END IF;
END $$;

ALTER TABLE "AppSetting"
  VALIDATE CONSTRAINT "AppSetting_mobile_launch_boolean_check";
