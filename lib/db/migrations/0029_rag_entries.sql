CREATE TYPE "rag_entry_type" AS ENUM ('text','document','image','audio','video','link','data');

CREATE TYPE "rag_entry_status" AS ENUM ('active','inactive','archived');

CREATE TYPE "rag_embedding_status" AS ENUM ('pending','ready','failed','queued');

CREATE TABLE "RagEntry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "content" text NOT NULL,
  "type" "rag_entry_type" NOT NULL DEFAULT 'text',
  "tags" text[] NOT NULL DEFAULT '{}'::text[],
  "sourceUrl" text,
  "status" "rag_entry_status" NOT NULL DEFAULT 'inactive',
  "models" text[] NOT NULL DEFAULT '{}'::text[],
  "addedBy" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "version" integer NOT NULL DEFAULT 1,
  "deletedAt" timestamp,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "embeddingStatus" "rag_embedding_status" NOT NULL DEFAULT 'pending',
  "embeddingModel" text,
  "embeddingDimensions" integer,
  "embeddingUpdatedAt" timestamp,
  "embeddingError" text,
  "supabaseVectorId" uuid
);

CREATE INDEX "RagEntry_status_idx" ON "RagEntry" ("status");
CREATE INDEX "RagEntry_addedBy_idx" ON "RagEntry" ("addedBy");
CREATE INDEX "RagEntry_createdAt_idx" ON "RagEntry" ("createdAt");

CREATE TABLE "RagEntryVersion" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ragEntryId" uuid NOT NULL REFERENCES "RagEntry"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "type" "rag_entry_type" NOT NULL,
  "status" "rag_entry_status" NOT NULL,
  "tags" text[] NOT NULL DEFAULT '{}'::text[],
  "models" text[] NOT NULL DEFAULT '{}'::text[],
  "sourceUrl" text,
  "diff" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "changeSummary" text,
  "editorId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "RagEntryVersion_entry_idx" ON "RagEntryVersion" ("ragEntryId");

CREATE TABLE "RagRetrievalLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ragEntryId" uuid NOT NULL REFERENCES "RagEntry"("id") ON DELETE CASCADE,
  "chatId" uuid REFERENCES "Chat"("id") ON DELETE CASCADE,
  "modelConfigId" uuid REFERENCES "ModelConfig"("id") ON DELETE SET NULL,
  "modelKey" text NOT NULL,
  "userId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "score" double precision NOT NULL DEFAULT 0,
  "queryText" text NOT NULL,
  "queryLanguage" varchar(16),
  "applied" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "RagRetrievalLog_entry_idx" ON "RagRetrievalLog" ("ragEntryId");
CREATE INDEX "RagRetrievalLog_model_idx" ON "RagRetrievalLog" ("modelKey");
CREATE INDEX "RagRetrievalLog_createdAt_idx" ON "RagRetrievalLog" ("createdAt");
