CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "token" varchar(128) NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "PasswordResetToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_idx"
  ON "PasswordResetToken" ("token");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_user_idx"
  ON "PasswordResetToken" ("userId");
