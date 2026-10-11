CREATE TABLE IF NOT EXISTS "ChatFileHold" (
  "key" text NOT NULL REFERENCES "ChatFile"("key"),
  "source" varchar(16) NOT NULL,
  "ownerId" text NOT NULL,
  PRIMARY KEY ("key", "source", "ownerId")
);
CREATE INDEX IF NOT EXISTS "ChatFileHold_owner_idx" ON "ChatFileHold" ("source", "ownerId");
ALTER TABLE "ChatFile" ADD COLUMN IF NOT EXISTS "holdRemovedAt" timestamptz;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.chat_storage_recalculate(file_key text) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE file_row record; deleted_through timestamptz; due timestamptz;
BEGIN
  SELECT * INTO file_row FROM public."ChatFile" WHERE "key" = file_key FOR UPDATE;
  IF NOT FOUND OR file_row."state" = 'deleting' THEN RETURN; END IF;
  IF file_row."state" = 'deleted'
    OR EXISTS (SELECT 1 FROM public."ChatFileHold" h WHERE h."key" = file_key)
    OR EXISTS (SELECT 1 FROM public."ChatFileReference" r JOIN public."Chat" c ON c."id" = r."chatId" WHERE r."key" = file_key AND c."deletedAt" IS NULL) THEN due := NULL;
  ELSE
    SELECT max(c."deletedAt" AT TIME ZONE 'UTC') INTO deleted_through FROM public."ChatFileReference" r JOIN public."Chat" c ON c."id" = r."chatId" WHERE r."key" = file_key;
    due := CASE WHEN deleted_through IS NOT NULL THEN GREATEST(deleted_through, COALESCE(file_row."holdRemovedAt", '-infinity'::timestamptz)) + interval '7 days' WHEN file_row."firstAttachedAt" IS NOT NULL THEN file_row."unreferencedAt" + interval '7 days' ELSE file_row."createdAt" + interval '24 hours' END;
  END IF;
  UPDATE public."ChatFile" SET "cleanupAfter" = due WHERE "key" = file_key AND "cleanupAfter" IS DISTINCT FROM due;
END $$;
CREATE OR REPLACE FUNCTION public.chat_storage_index_hold() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE owner_id text; file_key text; file_state text; old_keys text[] := ARRAY[]::text[]; new_keys text[] := ARRAY[]::text[];
BEGIN
  IF TG_TABLE_NAME = 'AppSetting' THEN
    owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."key" ELSE NEW."key" END;
    IF owner_id <> 'home.iconPrompts' THEN RETURN COALESCE(NEW, OLD); END IF;
  ELSE owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id"::text ELSE NEW."id"::text END;
  END IF;
  SELECT COALESCE(array_agg("key" ORDER BY "key"), ARRAY[]::text[]) INTO old_keys FROM public."ChatFileHold" WHERE "source" = TG_TABLE_NAME AND "ownerId" = owner_id;
  IF TG_OP <> 'DELETE' THEN
    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO new_keys FROM (
      SELECT DISTINCT public.chat_storage_key(item #>> '{}') k FROM jsonb_path_query(to_jsonb(NEW), 'lax $.** ? (@.type() == "string")') item WHERE public.chat_storage_key(item #>> '{}') IS NOT NULL
    ) keys;
  END IF;
  FOR file_key IN SELECT DISTINCT unnest(old_keys || new_keys) ORDER BY 1 LOOP
    IF file_key = ANY(new_keys) THEN INSERT INTO public."ChatFile" ("key", "userId", "state") VALUES (file_key, split_part(file_key,'/',2)::uuid, 'ready') ON CONFLICT DO NOTHING; END IF;
    SELECT "state" INTO file_state FROM public."ChatFile" WHERE "key" = file_key FOR UPDATE;
    IF file_key = ANY(new_keys) AND file_state IN ('deleting','deleted') THEN RAISE EXCEPTION 'This image has expired. Please upload it again.'; END IF;
  END LOOP;
  DELETE FROM public."ChatFileHold" WHERE "source" = TG_TABLE_NAME AND "ownerId" = owner_id;
  INSERT INTO public."ChatFileHold" ("key", "source", "ownerId") SELECT k, TG_TABLE_NAME, owner_id FROM unnest(new_keys) k;
  UPDATE public."ChatFile" SET "firstAttachedAt" = COALESCE("firstAttachedAt", now()) WHERE "key" = ANY(new_keys);
  FOR file_key IN SELECT DISTINCT unnest(old_keys || new_keys) ORDER BY 1 LOOP PERFORM public.chat_storage_recalculate(file_key); END LOOP;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS chat_storage_index_hold ON "Character";
CREATE TRIGGER chat_storage_index_hold AFTER INSERT OR UPDATE OR DELETE ON "Character" FOR EACH ROW EXECUTE FUNCTION public.chat_storage_index_hold();
DROP TRIGGER IF EXISTS chat_storage_index_hold ON "AppSetting";
CREATE TRIGGER chat_storage_index_hold AFTER INSERT OR UPDATE OR DELETE ON "AppSetting" FOR EACH ROW EXECUTE FUNCTION public.chat_storage_index_hold();
DROP TRIGGER IF EXISTS chat_storage_hold_removed ON "ChatFileHold";
CREATE OR REPLACE FUNCTION public.chat_storage_hold_removed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN UPDATE public."ChatFile" SET "unreferencedAt" = now(), "holdRemovedAt" = now() WHERE "key" = OLD."key"; RETURN OLD; END $$;
CREATE TRIGGER chat_storage_hold_removed AFTER DELETE ON "ChatFileHold" FOR EACH ROW EXECUTE FUNCTION public.chat_storage_hold_removed();
--> statement-breakpoint
UPDATE "Character" SET "id" = "id";
UPDATE "AppSetting" SET "key" = "key" WHERE "key" = 'home.iconPrompts';
--> statement-breakpoint
ALTER TABLE "ChatFileHold" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ChatFileHold" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_storage_index_hold() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_storage_hold_removed() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "ChatFileHold" FROM anon;
    REVOKE ALL ON FUNCTION public.chat_storage_key(text), public.chat_storage_keys(jsonb), public.chat_storage_account_delta(), public.chat_storage_reference_removed(), public.chat_storage_index_message(), public.chat_storage_guard_restore(), public.chat_storage_recalculate(text), public.chat_storage_recalculate_file(), public.chat_storage_recalculate_chat(), public.chat_storage_index_hold(), public.chat_storage_hold_removed() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "ChatFileHold" FROM authenticated;
    REVOKE ALL ON FUNCTION public.chat_storage_key(text), public.chat_storage_keys(jsonb), public.chat_storage_account_delta(), public.chat_storage_reference_removed(), public.chat_storage_index_message(), public.chat_storage_guard_restore(), public.chat_storage_recalculate(text), public.chat_storage_recalculate_file(), public.chat_storage_recalculate_chat(), public.chat_storage_index_hold(), public.chat_storage_hold_removed() FROM authenticated;
  END IF;
END $$;
