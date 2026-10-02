-- Account deletion must not erase financial history or be blocked by it.
ALTER TABLE "CreatorReferral" ALTER COLUMN "creatorId" DROP NOT NULL;
ALTER TABLE "CreatorReferral" DROP CONSTRAINT IF EXISTS "CreatorReferral_creatorId_fkey";
ALTER TABLE "CreatorReferral" ADD CONSTRAINT "CreatorReferral_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "ReferralCommission" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ReferralCommission" ALTER COLUMN "creatorId" DROP NOT NULL;
ALTER TABLE "ReferralCommission" DROP CONSTRAINT IF EXISTS "ReferralCommission_userId_fkey";
ALTER TABLE "ReferralCommission" DROP CONSTRAINT IF EXISTS "ReferralCommission_creatorId_fkey";
ALTER TABLE "ReferralCommission" DROP CONSTRAINT IF EXISTS "ReferralCommission_orderId_fkey";
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "ReferralPayout" ALTER COLUMN "recordedBy" DROP NOT NULL;
ALTER TABLE "ReferralPayout" DROP CONSTRAINT IF EXISTS "ReferralPayout_recordedBy_fkey";
ALTER TABLE "ReferralPayout" ADD CONSTRAINT "ReferralPayout_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL;
