ALTER TABLE "Character"
  ADD COLUMN IF NOT EXISTS "gender" text,
  ADD COLUMN IF NOT EXISTS "height" text,
  ADD COLUMN IF NOT EXISTS "weight" text,
  ADD COLUMN IF NOT EXISTS "complexion" text;
