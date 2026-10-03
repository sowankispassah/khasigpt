CREATE TABLE IF NOT EXISTS "Character" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "canonicalName" text NOT NULL,
  "aliases" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "refImages" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "lockedPrompt" text,
  "negativePrompt" text,
  "priority" integer NOT NULL DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CharacterAliasIndex" (
  "aliasNormalized" text PRIMARY KEY,
  "characterId" uuid NOT NULL REFERENCES "Character"("id") ON DELETE CASCADE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Character_canonicalName_idx"
ON public."Character" (lower("canonicalName"));

CREATE INDEX IF NOT EXISTS "Character_enabled_idx"
ON public."Character" ("enabled");

CREATE INDEX IF NOT EXISTS "CharacterAliasIndex_character_idx"
ON public."CharacterAliasIndex" ("characterId");
