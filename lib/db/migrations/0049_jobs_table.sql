CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  company text NOT NULL,
  location text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  source_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_source_url_key'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_source_url_key UNIQUE (source_url);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON public.jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_location_idx ON public.jobs (location);
