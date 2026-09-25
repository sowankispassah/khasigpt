CREATE INDEX IF NOT EXISTS "RagEntry_jobs_scope_idx"
ON "RagEntry" (
  ("metadata" ->> 'jobs_kind'),
  ("metadata" ->> 'jobs_source'),
  "status",
  "approvalStatus",
  "updatedAt"
)
WHERE "deletedAt" IS NULL AND "personalForUserId" IS NULL;

CREATE INDEX IF NOT EXISTS "RagEntry_jobs_lookup_idx"
ON "RagEntry" (
  ("metadata" ->> 'jobs_kind'),
  ("metadata" ->> 'jobs_source'),
  "id"
)
WHERE "deletedAt" IS NULL;
