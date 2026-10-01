import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeCodexJob } from "@/lib/jobs/codex-import";
import { resolveJobSalaryInfo } from "@/lib/jobs/salary";

const sourceUrl = "https://example.org/recruitment";
const pdfUrl = "https://example.org/notice.pdf";
const sources = new Map([[sourceUrl, { name: "Recruitment", url: sourceUrl }]]);
const visited = new Set([sourceUrl]);
const now = new Date("2026-10-01T00:00:00Z");
const description = "## Vacancies\nStenographer Grade I: 1 post. Driver: 4 posts.\n## Eligibility\nRequired qualifications and driving experience.\n## Application\nApply online by 24 October 2026 at 5 PM. Application fee: Rs. 400.";
const metadata = {
  version: 1, mode: "full", modelId: null, sourceStrategy: "llm_pdf",
  extractedAt: now.toISOString(), notificationDate: "2026-09-24", applicationLastDate: "2026-10-24T17:00:00+05:30",
  salarySummary: null,
  roles: [
    { title: "Stenographer Grade I", salaryText: "Rs. 49,000 (Level 16)", vacancies: "1", qualifications: "Degree and shorthand skills", location: "Shillong", evidenceText: "Page 1, pay table" },
    { title: "Driver", salaryText: "Rs. 20,600 (Level 3)", vacancies: "4", qualifications: "Valid driving licence", location: "Shillong", evidenceText: "Page 1, pay table" },
  ],
};
const base = {
  sourcePageUrl: sourceUrl, sourceUrl: pdfUrl, title: "Stenographer and Driver", company: "Example employer",
  location: "Shillong, Meghalaya", description, salary: null,
  pdfSourceUrl: pdfUrl, pdfContent: "Pay and eligibility table from the notice. Application closes on 24 October 2026.",
  pdfExtractedData: metadata,
};
const normalize = (input: unknown) => normalizeCodexJob(input, sources, visited, 10, now);

test("Codex PDF import retains complete description, PDF text, URL and structured role details", () => {
  const row = normalize(base);
  assert.ok(row);
  assert.equal(row.description, description);
  assert.equal(row.pdf_content, base.pdfContent);
  assert.equal(row.pdf_source_url, pdfUrl);
  assert.deepEqual(row.pdf_extracted_data, metadata);
  assert.equal(row.salary, "Rs. 20,600 - Rs. 49,000 across 2 roles");
  const display = resolveJobSalaryInfo({ salary: row.salary, extractedData: row.pdf_extracted_data });
  assert.deepEqual(display.entries.map((entry) => entry.role), ["Stenographer Grade I", "Driver"]);
});

test("direct PDFs cannot be imported without their reviewed text and metadata", () => {
  assert.equal(normalize({ ...base, pdfContent: undefined, pdfExtractedData: undefined }), null);
  assert.equal(normalize({ ...base, pdfExtractedData: { roles: [] } }), null);
  assert.equal(normalize({ ...base, pdfContent: "" }), null);
});

test("PDF linked from an HTML detail page retains both distinct source links", () => {
  const row = normalize({ ...base, sourceUrl: "https://example.org/job/1" });
  assert.equal(row?.source_url, "https://example.org/job/1");
  assert.equal(row?.pdf_source_url, pdfUrl);
});

test("malformed dates, oversized content, and invalid PDF URLs are rejected without truncation", () => {
  assert.equal(normalize({ ...base, pdfExtractedData: { ...metadata, applicationLastDate: "bad date" } }), null);
  assert.equal(normalize({ ...base, description: "x".repeat(20_001) }), null);
  assert.equal(normalize({ ...base, pdfContent: "x".repeat(100_001) }), null);
  assert.equal(normalize({ ...base, sourceUrl: "https://example.org/job/1", pdfSourceUrl: "javascript:alert(1)" }), null);
});

test("verified structured pay replaces an absent or NA salary input", () => {
  assert.equal(normalize({ ...base, salary: "NA" })?.salary, "Rs. 20,600 - Rs. 49,000 across 2 roles");
});

test("validated role names are preserved even outside the heuristic English vocabulary", () => {
  const custom = { ...metadata, roles: [{ ...metadata.roles[0], title: "Typist" }] };
  assert.equal(resolveJobSalaryInfo({ extractedData: custom as Parameters<typeof resolveJobSalaryInfo>[0]["extractedData"] }).entries[0].role, "Typist");
});

test("non-PDF listings stay supported without invented PDF metadata or salary", () => {
  const row = normalize({ ...base, sourceUrl: "https://example.org/job/1", pdfSourceUrl: undefined, pdfContent: undefined, pdfExtractedData: undefined });
  assert.ok(row);
  assert.equal(row.salary, null);
  assert.equal(row.pdf_extracted_data, null);
});

test("web detail shows description beside PDFs and mobile API exposes the same details", () => {
  const page = readFileSync("app/(chat)/jobs/[id]/page.tsx", "utf8");
  const api = readFileSync("app/api/mobile/jobs/[id]/route.ts", "utf8");
  assert.match(page, /const showDescriptionText = detailMarkdown.length > 0/);
  assert.match(api, /description: detailMarkdown/);
  assert.match(api, /compensationEntries: salaryInfo.entries/);
});
