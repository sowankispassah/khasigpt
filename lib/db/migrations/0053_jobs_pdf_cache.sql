ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS pdf_source_url text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS pdf_cached_url text;

CREATE INDEX IF NOT EXISTS jobs_pdf_source_url_idx ON public.jobs (pdf_source_url);
