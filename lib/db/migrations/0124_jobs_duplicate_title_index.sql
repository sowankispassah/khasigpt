CREATE INDEX IF NOT EXISTS jobs_active_title_idx
ON public.jobs (title)
WHERE status = 'active';
