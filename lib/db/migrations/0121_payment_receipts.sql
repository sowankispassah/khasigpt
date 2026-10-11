CREATE TABLE IF NOT EXISTS "PaymentReceipt" (
  "orderId" varchar(64) PRIMARY KEY REFERENCES "PaymentTransaction"("orderId") ON DELETE CASCADE,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "snapshot" jsonb NOT NULL,
  "emailRequested" boolean NOT NULL DEFAULT true,
  "emailSentAt" timestamp,
  "emailAttempts" integer NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamp NOT NULL DEFAULT now(),
  "leaseId" uuid,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "PaymentReceipt" ADD COLUMN IF NOT EXISTS "emailRequested" boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "PaymentReceipt_user_idx" ON "PaymentReceipt"("userId");
CREATE INDEX IF NOT EXISTS "PaymentReceipt_delivery_idx" ON "PaymentReceipt"("emailSentAt", "nextAttemptAt");
ALTER TABLE "PaymentReceipt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PaymentReceipt" FROM anon, authenticated;
