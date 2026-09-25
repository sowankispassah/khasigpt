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
  'chat.voice.web.enabled'
)
AND jsonb_typeof("value") = 'string';

DROP FUNCTION _unwrap_app_setting_jsonb_string(jsonb);
