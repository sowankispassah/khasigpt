CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "RagEntry"
  ADD COLUMN IF NOT EXISTS "language" varchar(16) NOT NULL DEFAULT 'und',
  ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 0;

ALTER TABLE "RagEntry"
  DROP COLUMN IF EXISTS "embeddingDimensions",
  DROP COLUMN IF EXISTS "supabaseVectorId";

ALTER TABLE "RagEntry"
  DROP CONSTRAINT IF EXISTS "RagEntry_priority_range";

ALTER TABLE "RagEntry"
  ADD CONSTRAINT "RagEntry_priority_range"
  CHECK ("priority" BETWEEN -100 AND 100);

ALTER TABLE "RagEntryVersion"
  ADD COLUMN IF NOT EXISTS "language" varchar(16) NOT NULL DEFAULT 'und',
  ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE "RagEntryVersion" AS version
SET "metadata" = entry."metadata"
FROM "RagEntry" AS entry
WHERE version."ragEntryId" = entry."id"
  AND version."metadata" = '{}'::jsonb;

UPDATE "RagEntry" AS entry
SET "tags" = array_append(entry."tags", category."name")
FROM "RagCategory" AS category
WHERE entry."categoryId" = category."id"
  AND NOT (entry."tags" @> ARRAY[category."name"]::text[]);

DROP INDEX IF EXISTS "RagEntry_category_idx";
ALTER TABLE "RagEntry" DROP COLUMN IF EXISTS "categoryId";
ALTER TABLE "RagEntryVersion" DROP COLUMN IF EXISTS "categoryId";
DROP TABLE IF EXISTS "RagCategory";

CREATE INDEX IF NOT EXISTS "RagEntry_retrieval_idx"
ON "RagEntry" ("status", "approvalStatus", "updatedAt");

CREATE TABLE IF NOT EXISTS "RagChunk" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ragEntryId" uuid NOT NULL REFERENCES "RagEntry"("id") ON DELETE CASCADE,
  "chunkIndex" integer NOT NULL,
  "content" text NOT NULL,
  "searchText" text NOT NULL,
  "contentHash" varchar(64) NOT NULL,
  "tokenCount" integer NOT NULL,
  "language" varchar(16) NOT NULL DEFAULT 'und',
  "embedding" extensions.vector(768) NOT NULL,
  "embeddingModel" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "RagChunk_tokenCount_positive" CHECK ("tokenCount" > 0),
  CONSTRAINT "RagChunk_chunkIndex_nonnegative" CHECK ("chunkIndex" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "RagChunk_entry_chunk_idx"
ON "RagChunk" ("ragEntryId", "chunkIndex");

CREATE INDEX IF NOT EXISTS "RagChunk_entry_idx"
ON "RagChunk" ("ragEntryId");

CREATE INDEX IF NOT EXISTS "RagChunk_search_gin_idx"
ON "RagChunk"
USING gin (to_tsvector('simple', "searchText"));

CREATE INDEX IF NOT EXISTS "RagChunk_embedding_hnsw_idx"
ON "RagChunk"
USING hnsw ("embedding" extensions.vector_cosine_ops);

ALTER TABLE "RagRetrievalLog"
  ADD COLUMN IF NOT EXISTS "ragChunkId" uuid REFERENCES "RagChunk"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "queryHash" varchar(64);

ALTER TABLE "RagRetrievalLog"
  ALTER COLUMN "queryText" DROP NOT NULL;

UPDATE "RagRetrievalLog"
SET "queryHash" = encode(digest(COALESCE("queryText", ''), 'sha256'), 'hex')
WHERE "queryHash" IS NULL;

CREATE INDEX IF NOT EXISTS "RagRetrievalLog_chunk_idx"
ON "RagRetrievalLog" ("ragChunkId");

CREATE TABLE IF NOT EXISTS "RagSearchLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chatId" uuid REFERENCES "Chat"("id") ON DELETE CASCADE,
  "modelConfigId" uuid REFERENCES "ModelConfig"("id") ON DELETE SET NULL,
  "modelKey" text NOT NULL,
  "userId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "chatScope" varchar(24) NOT NULL,
  "queryText" text,
  "queryHash" varchar(64) NOT NULL,
  "queryLanguage" varchar(16) NOT NULL,
  "status" varchar(24) NOT NULL,
  "resultCount" integer NOT NULL DEFAULT 0,
  "selectedCount" integer NOT NULL DEFAULT 0,
  "durationMs" integer NOT NULL DEFAULT 0,
  "failureReason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "RagSearchLog_createdAt_idx"
ON "RagSearchLog" ("createdAt");

CREATE INDEX IF NOT EXISTS "RagSearchLog_status_createdAt_idx"
ON "RagSearchLog" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "RagSearchLog_user_createdAt_idx"
ON "RagSearchLog" ("userId", "createdAt");

ALTER TABLE "RagChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RagSearchLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RagChunk" FROM anon, authenticated;
REVOKE ALL ON TABLE "RagSearchLog" FROM anon, authenticated;
