CREATE TABLE IF NOT EXISTS "ExploreCategory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL,
  "slug" varchar(140) NOT NULL,
  "description" text,
  "iconName" varchar(64) DEFAULT 'Compass' NOT NULL,
  "searchType" varchar(24) DEFAULT 'hybrid' NOT NULL,
  "searchQuery" text NOT NULL,
  "locationMode" varchar(40) DEFAULT 'current_or_selected' NOT NULL,
  "resultType" varchar(24) DEFAULT 'standard' NOT NULL,
  "suggestedPrompts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "isEnabled" boolean DEFAULT true NOT NULL,
  "showOnHome" boolean DEFAULT true NOT NULL,
  "displayOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ExploreCategory_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "ExploreSubcategory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "categoryId" uuid NOT NULL,
  "name" varchar(120) NOT NULL,
  "slug" varchar(140) NOT NULL,
  "description" text,
  "iconName" varchar(64) DEFAULT 'MapPin' NOT NULL,
  "searchQuery" text NOT NULL,
  "searchTypeOverride" varchar(24),
  "locationModeOverride" varchar(40),
  "isEnabled" boolean DEFAULT true NOT NULL,
  "displayOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ExploreSubcategory_categoryId_ExploreCategory_id_fk"
    FOREIGN KEY ("categoryId") REFERENCES "public"."ExploreCategory"("id")
    ON DELETE cascade,
  CONSTRAINT "ExploreSubcategory_category_slug_unique" UNIQUE("categoryId", "slug")
);

CREATE INDEX IF NOT EXISTS "ExploreCategory_enabled_order_idx"
  ON "ExploreCategory" ("isEnabled", "showOnHome", "displayOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "ExploreCategory_slug_idx"
  ON "ExploreCategory" ("slug");
CREATE INDEX IF NOT EXISTS "ExploreSubcategory_category_enabled_order_idx"
  ON "ExploreSubcategory" ("categoryId", "isEnabled", "displayOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "ExploreSubcategory_category_slug_idx"
  ON "ExploreSubcategory" ("categoryId", "slug");

ALTER TABLE "ExploreCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExploreSubcategory" ENABLE ROW LEVEL SECURITY;

INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('explore.meghalaya.enabled', '"admin_only"'::jsonb, now())
ON CONFLICT ("key") DO NOTHING;
