CREATE TABLE "RagCategory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "RagCategory_name_idx" ON "RagCategory" ("name");

ALTER TABLE "RagEntry"
  ADD COLUMN "categoryId" uuid REFERENCES "RagCategory"("id") ON DELETE SET NULL;

CREATE INDEX "RagEntry_category_idx" ON "RagEntry" ("categoryId");

ALTER TABLE "RagEntryVersion"
  ADD COLUMN "categoryId" uuid;
