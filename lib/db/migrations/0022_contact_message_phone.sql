ALTER TABLE "ContactMessage"
ADD COLUMN IF NOT EXISTS "phone" varchar(32);
