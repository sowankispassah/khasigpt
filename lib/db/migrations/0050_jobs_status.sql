ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

UPDATE public.jobs
SET status = 'active'
WHERE status IS NULL OR status NOT IN ('active', 'inactive');

CREATE INDEX IF NOT EXISTS jobs_status_idx ON public.jobs (status);
