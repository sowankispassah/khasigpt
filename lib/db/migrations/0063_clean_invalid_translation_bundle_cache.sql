-- Translation bundles are render caches, not source data.
-- Old builds persisted bundles under arbitrary requested language/path values
-- such as "wp-login.php" or ".env", which bloated AppSetting and caused
-- unrelated app-setting cache invalidation after inline translation edits.
DELETE FROM "AppSetting" AS settings
WHERE settings."key" LIKE 'translation_bundle:%'
  AND settings."key" <> 'translation_bundle:__default'
  AND NOT EXISTS (
    SELECT 1
    FROM "language" AS language
    WHERE settings."key" = 'translation_bundle:' || lower(language."code")
      AND language."isActive" = true
  );
