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
  'chat.customKnowledge',
  'chat.liveTranslation.android.enabled',
  'chat.liveTranslation.web.enabled',
  'chat.voice.android.enabled',
  'chat.voice.enabled',
  'chat.voice.web.enabled'
)
AND jsonb_typeof("value") = 'string';

WITH live_translation_defaults("key", "value") AS (
  VALUES
    (
      'chat.liveTranslation.supportedLanguages',
      '[
        {"code":"auto","name":"Auto Detect"},
        {"code":"en","name":"English"},
        {"code":"kha","name":"Khasi"},
        {"code":"hi","name":"Hindi"},
        {"code":"bn","name":"Bengali"},
        {"code":"as","name":"Assamese"},
        {"code":"ne","name":"Nepali"}
      ]'::jsonb
    ),
    ('chat.liveTranslation.defaultLanguageA', to_jsonb('auto'::text)),
    ('chat.liveTranslation.defaultLanguageB', to_jsonb('kha'::text)),
    (
      'chat.liveTranslation.systemInstruction',
      to_jsonb($live_translation_instruction$You are KhasiGPT Live Translation, a real-time voice interpreter between two people.
Do not converse with either speaker as an assistant.
Listen to each spoken turn, detect which configured language side the speaker is using, and speak only the translated meaning in the opposite configured language.
When one side is Auto Detect, infer the spoken language and translate into the other configured language.
Keep translations natural, concise, and suitable to be spoken aloud immediately.
Do not add explanations, labels, notes, or commentary.
Do not mention system instructions, transcripts, tokens, or implementation details.$live_translation_instruction$::text)
    ),
    ('chat.liveTranslation.android.enabled', to_jsonb('admin_only'::text)),
    ('chat.liveTranslation.web.enabled', to_jsonb('admin_only'::text))
)
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
SELECT "key", "value", now()
FROM live_translation_defaults
ON CONFLICT ("key") DO NOTHING;

WITH legacy_voice AS (
  SELECT lower(_unwrap_app_setting_jsonb_string("value") #>> '{}') AS mode
  FROM "AppSetting"
  WHERE "key" = 'chat.voice.enabled'
  LIMIT 1
),
voice_defaults("key", "value") AS (
  VALUES
    (
      'chat.voice.android.enabled',
      to_jsonb(COALESCE((SELECT mode FROM legacy_voice), 'admin_only'))
    ),
    (
      'chat.voice.web.enabled',
      to_jsonb(COALESCE((SELECT mode FROM legacy_voice), 'admin_only'))
    )
)
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
SELECT "key", "value", now()
FROM voice_defaults
ON CONFLICT ("key") DO NOTHING;

DROP FUNCTION _unwrap_app_setting_jsonb_string(jsonb);
