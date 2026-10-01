CREATE INDEX IF NOT EXISTS "ContactMessage_email_kind_createdAt_idx" ON "ContactMessage" (lower(trim("email")), "kind", "createdAt", "id");
