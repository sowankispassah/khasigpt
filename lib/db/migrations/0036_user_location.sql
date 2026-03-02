ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "locationLatitude" double precision,
ADD COLUMN IF NOT EXISTS "locationLongitude" double precision,
ADD COLUMN IF NOT EXISTS "locationAccuracy" double precision,
ADD COLUMN IF NOT EXISTS "locationUpdatedAt" timestamp,
ADD COLUMN IF NOT EXISTS "locationConsent" boolean NOT NULL DEFAULT false;
