CREATE TYPE "payment_transaction_status" AS ENUM ('pending', 'processing', 'paid', 'failed');

CREATE TABLE "PaymentTransaction" (
    "orderId" varchar(64) PRIMARY KEY,
    "userId" uuid NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
    "planId" uuid NOT NULL REFERENCES "PricingPlan" ("id"),
    "status" "payment_transaction_status" NOT NULL DEFAULT 'pending',
    "amount" integer NOT NULL,
    "currency" varchar(16) NOT NULL,
    "notes" jsonb,
    "paymentId" varchar(128),
    "signature" varchar(256),
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "PaymentTransaction_user_idx" ON "PaymentTransaction" ("userId");
CREATE INDEX "PaymentTransaction_plan_idx" ON "PaymentTransaction" ("planId");
CREATE INDEX "PaymentTransaction_status_idx" ON "PaymentTransaction" ("status");
