import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { toJobListItem } from "@/lib/jobs/list-items";
import { resolveJobNotificationDateLabel } from "@/lib/jobs/dates";
import type { JobPostingRecord } from "@/lib/jobs/types";

function createJob(overrides: Partial<JobPostingRecord>): JobPostingRecord {
  const now = new Date("2026-03-06T00:00:00.000Z");
  return {
    id: overrides.id ?? randomUUID(),
    title: overrides.title ?? "General Assistant",
    content: overrides.content ?? "No description available.",
    company: overrides.company ?? "Acme Ltd",
    location: overrides.location ?? "Shillong",
    salary: overrides.salary ?? null,
    source: overrides.source ?? null,
    applicationLink: overrides.applicationLink ?? null,
    pdfContent: overrides.pdfContent ?? null,
    contentHash: overrides.contentHash ?? null,
    employmentType: overrides.employmentType ?? "Full-time",
    studyExam: overrides.studyExam ?? "Unknown",
    studyRole: overrides.studyRole ?? "Unknown",
    studyYears: overrides.studyYears ?? [],
    studyTags: overrides.studyTags ?? [],
    tags: overrides.tags ?? [],
    sourceUrl: overrides.sourceUrl ?? null,
    pdfSourceUrl: overrides.pdfSourceUrl ?? null,
    pdfCachedUrl: overrides.pdfCachedUrl ?? null,
    status: overrides.status ?? "active",
    approvalStatus: overrides.approvalStatus ?? "approved",
    embeddingStatus: overrides.embeddingStatus ?? "ready",
    metadata: overrides.metadata ?? {},
    models: overrides.models ?? [],
    categoryId: overrides.categoryId ?? null,
    parseError: overrides.parseError ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

test.describe("jobs notification date parsing", () => {
  test("extracts dated pattern from pdf text", () => {
    expect(
      resolveJobNotificationDateLabel({
        pdfContent:
          "ADVERTISEMENT Dated, Shillong, 5th February, 2026 The Meghalaya Basin Development Authority is hiring for the following positions.",
      })
    ).toBe("5th February, 2026");
  });

  test("extracts issue/publication style labels", () => {
    expect(
      resolveJobNotificationDateLabel({
        content: "Notification Date: 06 Mar 2026 Last date: 16 Mar 2026",
      })
    ).toBe("06 Mar 2026");
  });

  test("uses Not specified when no notification date is available", () => {
    expect(
      resolveJobNotificationDateLabel({
        content: "Recruitment notice. Apply online.",
      })
    ).toBe("Not specified");
  });

  test("converts linkedin relative posted dates using fetched time as reference", () => {
    expect(
      resolveJobNotificationDateLabel({
        content: "Web Content: Shillong, Meghalaya, India Actively Hiring 2 days ago",
        referenceDate: new Date("2026-03-06T18:20:18.000Z"),
      })
    ).toBe("04 Mar 2026");
  });

  test("list item does not fall back to createdAt for notification date", () => {
    const job = createJob({
      content: "Recruitment notice. Apply online.",
      createdAt: new Date("2026-03-06T18:20:18.000Z"),
    });

    const item = toJobListItem(job);

    expect(item.notificationDateLabel).toBe("Not specified");
  });
});
