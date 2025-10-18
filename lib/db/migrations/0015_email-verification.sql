CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "token" varchar(128) NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "EmailVerificationToken_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_token_idx"
  ON "EmailVerificationToken" ("token");

CREATE INDEX IF NOT EXISTS "EmailVerificationToken_user_idx"
  ON "EmailVerificationToken" ("userId");
