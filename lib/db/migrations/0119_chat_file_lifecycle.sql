CREATE TABLE IF NOT EXISTS "ChatStorageAccount" (
  "userId" uuid PRIMARY KEY,
  "bytes" bigint NOT NULL DEFAULT 0 CHECK ("bytes" >= 0),
  "files" integer NOT NULL DEFAULT 0 CHECK ("files" >= 0),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ChatStorageAccount_bytes_idx" ON "ChatStorageAccount" ("bytes" DESC, "userId");
CREATE TABLE IF NOT EXISTS "ChatFile" (
  "key" text PRIMARY KEY,
  "userId" uuid NOT NULL,
  "bytes" bigint NOT NULL DEFAULT 0 CHECK ("bytes" >= 0),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "observedAt" timestamptz NOT NULL DEFAULT now(),
  "state" varchar(16) NOT NULL DEFAULT 'reserved' CHECK ("state" IN ('reserved','ready','deleting','deleted')),
  "confirmed" boolean NOT NULL DEFAULT false,
  "etag" text,
  "firstAttachedAt" timestamptz,
  "unreferencedAt" timestamptz NOT NULL DEFAULT now(),
  "retryAt" timestamptz,
  "deletedAt" timestamptz,
  "failures" integer NOT NULL DEFAULT 0
);
ALTER TABLE "ChatFile" ADD COLUMN IF NOT EXISTS "cleanupAfter" timestamptz;
CREATE INDEX IF NOT EXISTS "ChatFile_owner_idx" ON "ChatFile" ("userId", "state");
CREATE INDEX IF NOT EXISTS "ChatFile_cleanup_idx" ON "ChatFile" ("state", "createdAt") WHERE "state" <> 'deleted';
CREATE INDEX IF NOT EXISTS "ChatFile_due_idx" ON "ChatFile" ("cleanupAfter", "key") WHERE "state" IN ('ready','reserved');
CREATE INDEX IF NOT EXISTS "ChatFile_retry_idx" ON "ChatFile" ("retryAt", "key") WHERE "state" = 'deleting';
CREATE TABLE IF NOT EXISTS "ChatFileReference" (
  "key" text NOT NULL REFERENCES "ChatFile"("key"),
  "source" varchar(16) NOT NULL,
  "messageId" uuid NOT NULL,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  PRIMARY KEY ("key", "source", "messageId")
);
CREATE INDEX IF NOT EXISTS "ChatFileReference_message_idx" ON "ChatFileReference" ("source", "messageId");
CREATE INDEX IF NOT EXISTS "ChatFileReference_chat_idx" ON "ChatFileReference" ("chatId", "key");
CREATE TABLE IF NOT EXISTS "ChatStorageMaintenance" (
  "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "prefix" integer NOT NULL DEFAULT 0 CHECK ("prefix" IN (0,1)),
  "cursor" text,
  "leaseId" uuid,
  "leaseUntil" timestamptz,
  "inventoryCompletedAt" timestamptz,
  "lastRunAt" timestamptz,
  "lastResult" jsonb
);
INSERT INTO "ChatStorageMaintenance" ("id") VALUES (1) ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Materialize due dates on lifecycle changes. Daily cleanup uses these indexes
-- rather than repeatedly inspecting every active account's entire file set.
CREATE OR REPLACE FUNCTION public.chat_storage_recalculate(file_key text) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE file_row record; deleted_through timestamptz; due timestamptz;
BEGIN
  SELECT * INTO file_row FROM public."ChatFile" WHERE "key" = file_key FOR UPDATE;
  IF NOT FOUND OR file_row."state" = 'deleting' THEN RETURN; END IF;
  IF file_row."state" = 'deleted' OR EXISTS (SELECT 1 FROM public."ChatFileReference" r JOIN public."Chat" c ON c."id" = r."chatId" WHERE r."key" = file_key AND c."deletedAt" IS NULL) THEN due := NULL;
  ELSE
    SELECT max(c."deletedAt" AT TIME ZONE 'UTC') INTO deleted_through FROM public."ChatFileReference" r JOIN public."Chat" c ON c."id" = r."chatId" WHERE r."key" = file_key;
    due := CASE WHEN deleted_through IS NOT NULL THEN deleted_through + interval '7 days' WHEN file_row."firstAttachedAt" IS NOT NULL THEN file_row."unreferencedAt" + interval '7 days' ELSE file_row."createdAt" + interval '24 hours' END;
  END IF;
  UPDATE public."ChatFile" SET "cleanupAfter" = due WHERE "key" = file_key AND "cleanupAfter" IS DISTINCT FROM due;
END $$;
CREATE OR REPLACE FUNCTION public.chat_storage_recalculate_file() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN PERFORM public.chat_storage_recalculate(NEW."key"); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS chat_storage_recalculate_file ON "ChatFile";
CREATE TRIGGER chat_storage_recalculate_file AFTER INSERT OR UPDATE OF "createdAt", "firstAttachedAt", "unreferencedAt", "state" ON "ChatFile" FOR EACH ROW EXECUTE FUNCTION public.chat_storage_recalculate_file();
CREATE OR REPLACE FUNCTION public.chat_storage_recalculate_chat() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE file_key text;
BEGIN
  IF OLD."deletedAt" IS DISTINCT FROM NEW."deletedAt" THEN
    FOR file_key IN SELECT DISTINCT "key" FROM public."ChatFileReference" WHERE "chatId" = NEW."id" ORDER BY "key" LOOP PERFORM public.chat_storage_recalculate(file_key); END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chat_storage_recalculate_chat ON "Chat";
CREATE TRIGGER chat_storage_recalculate_chat AFTER UPDATE OF "deletedAt" ON "Chat" FOR EACH ROW EXECUTE FUNCTION public.chat_storage_recalculate_chat();
--> statement-breakpoint
-- Reference indexing is for retention only. Decoding a persisted URL never
-- authenticates a download or grants access; those checks remain in the API.
CREATE OR REPLACE FUNCTION public.chat_storage_key(value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE token text; encoded text; result text;
BEGIN
  IF value ~ '(^https?://[^/]+)?/api/files/download[?]' THEN
    token := substring(value from '[?&]token=([A-Za-z0-9_.-]+)');
    IF token IS NULL THEN RAISE EXCEPTION 'Unrecognized private file reference'; END IF;
    encoded := translate(split_part(token, '.', 1), '-_', '+/');
    encoded := encoded || repeat('=', (4 - length(encoded) % 4) % 4);
    result := (convert_from(decode(encoded, 'base64'), 'UTF8')::jsonb)->>'key';
    IF result IS NULL THEN RAISE EXCEPTION 'Unrecognized private file reference'; END IF;
  ELSIF value ~ '^https://[^/]*blob[.]vercel-storage[.]com/' THEN
    result := regexp_replace(split_part(split_part(value, '?', 1), '#', 1), '^https://[^/]+/', '');
  ELSE RETURN NULL;
  END IF;
  IF result ~ '^(uploads/[0-9a-fA-F-]{36}/[a-zA-Z0-9_-]+[.](pdf|docx|png|jpg|jpeg)|generated-images/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[a-zA-Z0-9_-]+[.](png|jpg|jpeg))$' THEN
    RETURN result;
  END IF;
  -- A malformed owned reference must stop indexing/cleanup, never disappear
  -- silently and turn an existing file into a supposed orphan.
  IF result ~ '^(uploads|generated-images)/' THEN RAISE EXCEPTION 'Unrecognized private file reference'; END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.chat_storage_keys(value jsonb) RETURNS SETOF text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT DISTINCT public.chat_storage_key(item #>> '{}') FROM jsonb_path_query(COALESCE(value, '[]'::jsonb), 'lax $.**.url') item
  WHERE jsonb_typeof(item) = 'string' AND public.chat_storage_key(item #>> '{}') IS NOT NULL
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.chat_storage_account_delta() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE before_bytes bigint := 0; before_files integer := 0; after_bytes bigint := 0; after_files integer := 0;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."confirmed" AND OLD."state" <> 'deleted' THEN before_bytes := OLD."bytes"; before_files := 1; END IF;
  IF NEW."confirmed" AND NEW."state" <> 'deleted' THEN after_bytes := NEW."bytes"; after_files := 1; END IF;
  IF after_bytes = before_bytes AND after_files = before_files THEN RETURN NEW; END IF;
  INSERT INTO public."ChatStorageAccount" ("userId") VALUES (NEW."userId") ON CONFLICT DO NOTHING;
  UPDATE public."ChatStorageAccount" SET "bytes" = "bytes" + after_bytes - before_bytes, "files" = "files" + after_files - before_files, "updatedAt" = now() WHERE "userId" = NEW."userId";
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chat_storage_account_delta ON "ChatFile";
CREATE TRIGGER chat_storage_account_delta AFTER INSERT OR UPDATE OF "bytes", "confirmed", "state" ON "ChatFile" FOR EACH ROW EXECUTE FUNCTION public.chat_storage_account_delta();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.chat_storage_reference_removed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public."ChatFile" SET "unreferencedAt" = now() WHERE "key" = OLD."key";
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS chat_storage_reference_removed ON "ChatFileReference";
CREATE TRIGGER chat_storage_reference_removed AFTER DELETE ON "ChatFileReference" FOR EACH ROW EXECUTE FUNCTION public.chat_storage_reference_removed();
CREATE OR REPLACE FUNCTION public.chat_storage_index_message() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE file_key text; status text; body jsonb; previous_keys text[] := ARRAY[]::text[]; next_keys text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT COALESCE(array_agg("key" ORDER BY "key"), ARRAY[]::text[]) INTO previous_keys FROM public."ChatFileReference" WHERE "source" = TG_TABLE_NAME AND "messageId" = OLD."id";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    body := CASE WHEN TG_TABLE_NAME = 'Message_v2' THEN jsonb_build_array(to_jsonb(NEW)->'parts', to_jsonb(NEW)->'attachments') ELSE to_jsonb(NEW)->'content' END;
    SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO next_keys FROM public.chat_storage_keys(body) k;
  END IF;
  -- Consistent lock order serializes saves with cleanup claims, including
  -- update/delete paths used by both web and native clients.
  FOR file_key IN SELECT DISTINCT unnest(previous_keys || next_keys) ORDER BY 1 LOOP
    IF file_key = ANY(next_keys) THEN
      INSERT INTO public."ChatFile" ("key", "userId", "state", "firstAttachedAt") VALUES (file_key, split_part(file_key, '/', 2)::uuid, 'ready', NEW."createdAt" AT TIME ZONE 'UTC') ON CONFLICT DO NOTHING;
    END IF;
    SELECT "state" INTO status FROM public."ChatFile" WHERE "key" = file_key FOR UPDATE;
    IF file_key = ANY(next_keys) AND status IN ('deleting','deleted') THEN RAISE EXCEPTION 'This chat attachment has expired. Please upload it again.'; END IF;
  END LOOP;
  IF TG_OP <> 'INSERT' THEN DELETE FROM public."ChatFileReference" WHERE "source" = TG_TABLE_NAME AND "messageId" = OLD."id"; END IF;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO public."ChatFileReference" ("key", "source", "messageId", "chatId") SELECT k, TG_TABLE_NAME, NEW."id", NEW."chatId" FROM unnest(next_keys) k;
    UPDATE public."ChatFile" SET "firstAttachedAt" = COALESCE("firstAttachedAt", NEW."createdAt" AT TIME ZONE 'UTC') WHERE "key" = ANY(next_keys);
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS chat_storage_index_message ON "Message_v2";
CREATE TRIGGER chat_storage_index_message AFTER INSERT OR UPDATE OF "parts", "attachments" OR DELETE ON "Message_v2" FOR EACH ROW EXECUTE FUNCTION public.chat_storage_index_message();
DROP TRIGGER IF EXISTS chat_storage_index_message ON "Message";
CREATE TRIGGER chat_storage_index_message AFTER INSERT OR UPDATE OF "content" OR DELETE ON "Message" FOR EACH ROW EXECUTE FUNCTION public.chat_storage_index_message();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.chat_storage_guard_restore() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE item record;
BEGIN
  IF OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL THEN
    FOR item IN SELECT f."state" FROM public."ChatFile" f WHERE f."key" IN (SELECT "key" FROM public."ChatFileReference" WHERE "chatId" = NEW."id") ORDER BY f."key" FOR UPDATE LOOP
      IF item."state" IN ('deleting','deleted') THEN RAISE EXCEPTION 'Chat attachments have expired and cannot be restored.'; END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS chat_storage_guard_restore ON "Chat";
CREATE TRIGGER chat_storage_guard_restore BEFORE UPDATE OF "deletedAt" ON "Chat" FOR EACH ROW EXECUTE FUNCTION public.chat_storage_guard_restore();
--> statement-breakpoint
-- Backfill existing references atomically before cleanup can be deployed.
-- The triggers index the existing URLs without rewriting their contents.
UPDATE "Message_v2" SET "parts" = "parts" WHERE "parts"::text LIKE '%blob.vercel-storage.com%' OR "parts"::text LIKE '%/api/files/download%' OR "attachments"::text LIKE '%/api/files/download%' OR "attachments"::text LIKE '%blob.vercel-storage.com%';
UPDATE "Message" SET "content" = "content" WHERE "content"::text LIKE '%blob.vercel-storage.com%' OR "content"::text LIKE '%/api/files/download%';
SELECT public.chat_storage_recalculate("key") FROM "ChatFile" ORDER BY "key";
--> statement-breakpoint
ALTER TABLE "ChatFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatFileReference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatStorageAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatStorageMaintenance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ChatFile", "ChatFileReference", "ChatStorageAccount", "ChatStorageMaintenance" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_storage_key(text), public.chat_storage_keys(jsonb), public.chat_storage_account_delta(), public.chat_storage_reference_removed(), public.chat_storage_index_message(), public.chat_storage_guard_restore() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_storage_recalculate(text), public.chat_storage_recalculate_file(), public.chat_storage_recalculate_chat() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "ChatFile", "ChatFileReference", "ChatStorageAccount", "ChatStorageMaintenance" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "ChatFile", "ChatFileReference", "ChatStorageAccount", "ChatStorageMaintenance" FROM authenticated; END IF;
END $$;
