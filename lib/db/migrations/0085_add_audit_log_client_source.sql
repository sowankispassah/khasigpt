ALTER TABLE "AuditLog"
ADD COLUMN IF NOT EXISTS "clientSource" varchar(64);

UPDATE "AuditLog"
SET "clientSource" = CASE
  WHEN lower(COALESCE("metadata"->>'clientSource', "metadata"->>'client', '')) LIKE '%android%'
    OR lower(COALESCE("metadata"->>'platform', '')) = 'android'
    OR lower(COALESCE("userAgent", '')) LIKE '%okhttp/%'
    THEN 'android_native'
  WHEN lower(COALESCE("metadata"->>'clientSource', "metadata"->>'client', '')) LIKE '%ios%'
    OR lower(COALESCE("metadata"->>'platform', '')) = 'ios'
    THEN 'ios_native'
  WHEN lower(COALESCE("metadata"->>'client', '')) = 'native'
    THEN 'android_native'
  WHEN lower(COALESCE("userAgent", '')) LIKE '%bot%'
    OR lower(COALESCE("userAgent", '')) LIKE '%crawl%'
    OR lower(COALESCE("userAgent", '')) LIKE '%spider%'
    THEN 'bot'
  WHEN lower(COALESCE("userAgent", '')) LIKE '%mobile%'
    OR lower(COALESCE("userAgent", '')) LIKE '%android%'
    OR lower(COALESCE("userAgent", '')) LIKE '%iphone%'
    OR lower(COALESCE("userAgent", '')) LIKE '%ipad%'
    OR lower(COALESCE("device", '')) IN ('mobile', 'tablet')
    THEN 'mobile_browser'
  WHEN lower(COALESCE("userAgent", '')) LIKE '%macintosh%'
    OR lower(COALESCE("userAgent", '')) LIKE '%windows%'
    OR lower(COALESCE("userAgent", '')) LIKE '%linux%'
    OR lower(COALESCE("device", '')) = 'desktop'
    THEN 'desktop_browser'
  WHEN NULLIF(trim(COALESCE("userAgent", '')), '') IS NOT NULL
    THEN 'browser'
  ELSE 'unknown'
END
WHERE "clientSource" IS NULL;
