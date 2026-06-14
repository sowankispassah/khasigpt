CREATE TABLE IF NOT EXISTS "UserPresence" (
  "userId" uuid PRIMARY KEY REFERENCES "public"."User"("id") ON DELETE CASCADE,
  "lastSeenAt" timestamp NOT NULL DEFAULT now(),
  "lastPath" varchar(200),
  "device" varchar(32),
  "locale" varchar(32),
  "timezone" varchar(64),
  "city" varchar(128),
  "region" varchar(128),
  "country" varchar(32),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "UserPresence_lastSeenAt_idx"
ON public."UserPresence" ("lastSeenAt");

CREATE INDEX IF NOT EXISTS "UserPresence_country_idx"
ON public."UserPresence" ("country");

CREATE INDEX IF NOT EXISTS "UserPresence_region_idx"
ON public."UserPresence" ("region");

CREATE INDEX IF NOT EXISTS "UserPresence_city_idx"
ON public."UserPresence" ("city");
