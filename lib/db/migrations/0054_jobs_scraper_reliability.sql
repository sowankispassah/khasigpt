ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS salary text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS application_link text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS pdf_content text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS content_hash text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS scraped_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS jobs_salary_idx ON public.jobs (salary);
CREATE INDEX IF NOT EXISTS jobs_source_idx ON public.jobs (source);
CREATE INDEX IF NOT EXISTS jobs_application_link_idx ON public.jobs (application_link);
CREATE INDEX IF NOT EXISTS jobs_content_hash_idx ON public.jobs (content_hash);
CREATE INDEX IF NOT EXISTS jobs_scraped_at_idx ON public.jobs (scraped_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_content_hash_key'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_content_hash_key UNIQUE (content_hash);
  END IF;
END
$$;

