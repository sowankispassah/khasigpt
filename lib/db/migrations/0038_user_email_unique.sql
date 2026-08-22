-- Ensure each normalized email address is unique by keeping the earliest record
-- and renaming later duplicates with a safe suffix that stays within 64 chars.
WITH ranked_users AS (
  SELECT
    "id",
    "email",
    lower("email") AS normalized_email,
    row_number() OVER (
      PARTITION BY lower("email")
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "User"
)
UPDATE "User" AS u
SET "email" = concat(
  left(u."email", 48),
  '+dup-',
  substr(u."id"::text, 1, 8)
)
FROM ranked_users r
WHERE u."id" = r."id"
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_idx"
ON public."User" (lower("email"));
