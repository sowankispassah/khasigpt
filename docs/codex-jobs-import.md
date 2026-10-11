# Codex jobs import

When Admin Jobs selects **ChatGPT app schedule**, the project web scraper is
blocked. The ChatGPT Scheduled task gathers job listings with its own web
tools. KhasiGPT only reads the enabled source configuration and saves validated
rows to the jobs database. Codex reads PDFs with its own tools and supplies their text and structured
details. The importer does not fetch websites, process PDF files, call Google's
API, or run the project scraper.

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

## Complete PDF-backed listings

Read every page of a linked recruitment PDF with Codex tools before importing.
Inspect scanned pages visually when text extraction is incomplete. Do not save a
short teaser in place of the recruitment details. In `description`, write clear
Markdown sections for every fact the notice discloses: roles and vacancies,
role-specific pay and pay levels, qualifications and experience, eligibility
and age limits/relaxations, posting location, employment/contract terms,
selection process, application fees, required documents, application method and
link/address, notification date, deadline including the stated time/timezone,
and official contact details. Keep facts mapped to their correct role. Distinguish
application fees from pay; never invent missing fields or infer take-home pay.

Alongside the normal listing fields, PDF-backed inputs must supply:

- `pdfSourceUrl`: the verified public PDF URL (even if `sourceUrl` is an HTML page).
- `pdfContent`: faithfully transcribed relevant PDF text, including tables and
  all recruitment details (20–100,000 characters).
- `pdfExtractedData`: the existing validated extraction object shown below.
- `description`: a complete readable explanation, up to 20,000 characters.
  Full qualifications/instructions must remain here if a role field is too short.

```json
{
  "pdfSourceUrl": "https://example.invalid/recruitment.pdf",
  "pdfContent": "Only verified recruitment text transcribed by Codex.",
  "pdfExtractedData": {
    "version": 1,
    "mode": "full",
    "modelId": null,
    "sourceStrategy": "llm_pdf",
    "extractedAt": "2026-10-01T00:00:00.000Z",
    "notificationDate": null,
    "applicationLastDate": null,
    "salarySummary": null,
    "roles": [
      {
        "title": "Exact advertised role",
        "vacancies": null,
        "salaryText": null,
        "location": null,
        "qualifications": null,
        "evidenceText": "PDF page and section supporting these fields"
      }
    ]
  }
}
```

This is a schema example, not a listing to import. Use ISO dates/timestamps,
keeping the stated deadline time and timezone. `modelId` may remain null;
this field records provenance and never launches an AI API call. Role fields
have limits: title/location/salary 220 characters, vacancies 120,
qualifications 500, evidence 600. Include every role, even if its salary is not
stated. `salarySummary` has a 220-character limit; use a pay range for large
multi-role notices while preserving exact amounts in `roles` and `description`.
The importer derives the salary from verified structured pay when available.
Missing or malformed PDF data and oversized text are rejected rather than
silently dropped/truncated. If a required PDF cannot be read, exclude the listing
and report the verification failure. Ordinary HTML-only listings may omit PDF
fields. Duplicate listings continue to be skipped; this does not repair older rows.

Web job details show the written description alongside the PDF preview and
role-specific pay. The mobile details API returns the same description and
compensation entries. No additional project scraper or provider API is involved.
