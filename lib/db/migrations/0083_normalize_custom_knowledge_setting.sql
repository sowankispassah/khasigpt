UPDATE "AppSetting"
SET
  "value" = CASE lower("value" #>> '{}')
    WHEN 'true' THEN 'true'::jsonb
    WHEN 'false' THEN 'false'::jsonb
  END,
  "updatedAt" = now()
WHERE "key" = 'chat.customKnowledge'
  AND jsonb_typeof("value") = 'string'
  AND lower("value" #>> '{}') IN ('true', 'false');
