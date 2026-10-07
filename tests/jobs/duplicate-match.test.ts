import assert from "node:assert/strict";
import { test } from "node:test";
import { duplicateJobPdfBackfill, isSameJob } from "../../lib/jobs/duplicate-match";

const posting = {
  title: "Assistant Engineer",
  company: "Meghalaya Energy Corporation",
  location: "Shillong",
  description: "Advertisement No. MEECL/REC/2026-09. Applications are invited for Assistant Engineer posts in Shillong, Meghalaya. Closing date 31 October 2026.",
  pdf_source_url: null,
};

test("matches the same advertisement across different source pages", () => {
  assert.equal(isSameJob(posting, { ...posting, description: posting.description.replace("Applications are invited", "Online applications are invited") }), true);
});

test("keeps distinct roles, employers, rounds, document IDs and case-sensitive PDF paths", () => {
  const job = { ...posting, title: "Assistant Engineer Civil", pdf_source_url: "https://example.gov.in/Jobs.pdf?id=one" };
  assert.equal(isSameJob(job, { ...job, title: "Assistant Engineer Electrical" }), false);
  assert.equal(isSameJob(job, { ...job, company: "Meghalaya Police" }), false);
  assert.equal(isSameJob(job, { ...job, description: job.description.replace("2026-09", "2026-10") }), false);
  assert.equal(isSameJob(job, { ...job, pdf_source_url: "https://example.gov.in/Jobs.pdf?id=two" }), false);
  assert.equal(isSameJob(job, { ...job, pdf_source_url: "https://example.gov.in/jobs.pdf?id=one" }), false);
  assert.equal(isSameJob(
    { ...job, pdf_source_url: "https://example.gov.in/get?download=first.pdf" },
    { ...job, pdf_source_url: "https://example.gov.in/get?download=second.pdf" },
  ), false);
  assert.equal(isSameJob({}, {}), false);
});

test("fills missing fields only for the same PDF and never mixes different documents", () => {
  const current = { pdf_source_url: "https://example.gov.in/jobs.pdf", pdf_cached_url: "https://cache.example/jobs.pdf", pdf_content: null };
  const incoming = { pdf_source_url: "https://example.gov.in/jobs.pdf?download=1", pdf_cached_url: "https://cache.example/new.pdf", pdf_content: "Confirmed PDF text" };
  assert.deepEqual(duplicateJobPdfBackfill(current, incoming), { pdf_content: "Confirmed PDF text" });
  assert.equal(duplicateJobPdfBackfill(current, { ...incoming, pdf_source_url: "https://example.gov.in/other.pdf" }), null);
  assert.deepEqual(duplicateJobPdfBackfill({ pdf_cached_url: "https://cache.example/orphan.pdf" }, incoming), {
    pdf_source_url: incoming.pdf_source_url,
    pdf_cached_url: incoming.pdf_cached_url,
    pdf_content: incoming.pdf_content,
    pdf_extracted_data: null,
  });
});

test("keeps separate recruitment rounds and employers", () => {
  assert.equal(isSameJob(posting, { ...posting, description: posting.description.replace("2026-09", "2026-10") }), false);
  assert.equal(isSameJob(posting, { ...posting, company: "Meghalaya Police" }), false);
  const description = "Notification dated 01 October 2026. Applications are invited for Assistant Engineer posts in Shillong, Meghalaya. Applications must include all required qualifications and supporting documents.";
  assert.equal(isSameJob(
    { ...posting, description },
    { ...posting, description: description.replace("01 October", "02 November") },
  ), false);
});

test("matches shared PDFs even when page titles differ", () => {
  assert.equal(isSameJob(
    { ...posting, pdf_source_url: "https://example.gov.in/a/job.pdf?download=1" },
    { ...posting, title: "Assistant Engineer recruitment", pdf_source_url: "https://example.gov.in/a/job.pdf" },
  ), true);
  assert.equal(isSameJob(
    { ...posting, pdf_source_url: "https://example.gov.in/a/job.pdf" },
    { ...posting, title: "Junior Accountant", pdf_source_url: "https://example.gov.in/a/job.pdf" },
  ), false);
});
