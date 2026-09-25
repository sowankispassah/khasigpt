# Codex jobs import

When Admin Jobs selects **ChatGPT app schedule**, the project web scraper is
blocked. The ChatGPT Scheduled task gathers job listings with its own web
tools. KhasiGPT only reads the enabled source configuration and saves validated
rows to the jobs database. This path does not process PDFs, call Google's API,
or run the project scraper.

The task runs daily at 6:00 AM India time. **Run now** in Scheduled follows the
same steps and can run again on the same day. The computer and ChatGPT desktop
app must be available for a local run.

1. Run `pnpm jobs:codex sources` to read the current runner mode, lookback
   window, and enabled source URLs. Stop if the result says `runner_mode`.
2. For each source, use Codex web search or browser tools to find current job
   detail pages. If a search landing page cannot be opened, a targeted search
   for that source and location is acceptable. Verify each detail page and
   visible posting date. Do not use the project scraper or Google API key.
3. Write a temporary JSON file with the shape below. Include every enabled
   source in `visitedSources`, marking unavailable sources `failed`. An
   `ok` status means a source was searched successfully, even if no current
   jobs were found. Include only real, open listings with a specific job URL.
4. Run `pnpm jobs:codex import <absolute-json-path>`. The importer rejects
   stale LinkedIn posts, non-Meghalaya locations for Meghalaya-only sources,
   invalid links, and incomplete rows. It deduplicates by job URL. Remove the
   temporary file after the import.

```json
{
  "visitedSources": [
    {
      "url": "https://in.linkedin.com/jobs/search/?keywords=Shillong&location=Meghalaya",
      "status": "ok"
    }
  ],
  "jobs": [
    {
      "sourcePageUrl": "https://in.linkedin.com/jobs/search/?keywords=Shillong&location=Meghalaya",
      "sourceUrl": "https://example.invalid/job/123",
      "title": "Example role",
      "company": "Example employer",
      "location": "Shillong, Meghalaya",
      "description": "Only facts visible on the job detail page.",
      "publishedAt": "2026-09-25T06:00:00.000Z",
      "applicationUrl": "https://example.invalid/job/123",
      "salary": null
    }
  ]
}
```

The JSON block is an input example, not a job to import. Its example.invalid
URL intentionally fails the LinkedIn-source validation. For LinkedIn jobs,
`publishedAt` is required and must be within the configured lookback window.
For other sources it may be omitted when no date is visible, but the task must
still confirm the posting is open. If every source fails, the importer records a
failed run and does not mark the day successful.
