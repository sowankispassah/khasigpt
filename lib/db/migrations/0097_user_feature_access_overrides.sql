CREATE TABLE IF NOT EXISTS "UserFeatureAccessOverride" (
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "featureKey" varchar(160) NOT NULL,
  "enabled" boolean NOT NULL,
  "updatedByAdminId" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "UserFeatureAccessOverride_userId_featureKey_pk" PRIMARY KEY ("userId", "featureKey")
);
CREATE INDEX IF NOT EXISTS "UserFeatureAccessOverride_featureKey_idx"
  ON "UserFeatureAccessOverride" ("featureKey");
ALTER TABLE "UserFeatureAccessOverride" ENABLE ROW LEVEL SECURITY;
