-- Clear all persisted translation render caches once so old fallback bundles
-- cannot keep serving mostly-English dictionaries after inline translation edits.
-- Source translation rows in translation_key/translation_value are untouched.
DELETE FROM "AppSetting"
WHERE "key" LIKE 'translation_bundle:%';
