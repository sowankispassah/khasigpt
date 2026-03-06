import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { resolveJobsFilterConversation } from "@/lib/jobs/filtering";
import type { JobPostingRecord } from "@/lib/jobs/types";

function createJob(overrides: Partial<JobPostingRecord>): JobPostingRecord {
  const now = new Date("2026-03-03T00:00:00.000Z");
  return {
    id: overrides.id ?? randomUUID(),
    title: overrides.title ?? "General Assistant",
    content: overrides.content ?? "12th pass required. Salary Rs 18000 to Rs 24000 per month.",
    company: overrides.company ?? "Acme Ltd",
    location: overrides.location ?? "Agartala",
    salary: overrides.salary ?? null,
    source: overrides.source ?? null,
    applicationLink: overrides.applicationLink ?? null,
    pdfContent: overrides.pdfContent ?? null,
    contentHash: overrides.contentHash ?? null,
    sector: overrides.sector ?? "unknown",
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
    parseError: overrides.parseError,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

const jobs: JobPostingRecord[] = [
  createJob({
    id: "job-12th-govt",
    title: "Office Assistant",
    company: "Public Hiring Board",
    location: "Agartala",
    content:
      "Clerical opening. 12th pass required. Salary Rs 18000 to Rs 22000 per month.",
    sector: "government",
    tags: ["clerical"],
  }),
  createJob({
    id: "job-12th-private",
    title: "Store Helper",
    company: "Retail Hub",
    location: "Agartala",
    content:
      "Store operations role. 12th pass required. Salary Rs 16000 to Rs 20000 per month. Part-time allowed.",
    sector: "private",
    tags: ["retail", "part-time"],
  }),
  createJob({
    id: "job-grad",
    title: "Data Analyst",
    company: "Insight Analytics",
    location: "Shillong",
    content:
      "Graduate degree required. Salary Rs 35000 to Rs 45000 per month. Full-time private role.",
    sector: "private",
    tags: ["private", "analytics"],
  }),
];

test.describe("jobs filtering engine", () => {
  test("filters by qualification and salary range", () => {
    const result = resolveJobsFilterConversation({
      jobs,
      priorUserMessages: [],
      latestUserMessage: "Show me jobs for 12th pass qualification with salary between Rs 15000 and Rs 25000",
    });

    expect(result.clarification).toBeNull();
    expect(result.hasActiveFilters).toBe(true);
    expect(result.filteredJobs.map((job) => job.id)).toEqual([
      "job-12th-govt",
      "job-12th-private",
    ]);
  });

  test("refines previous result with follow-up sector filter", () => {
    const result = resolveJobsFilterConversation({
      jobs,
      priorUserMessages: ["Show me 12th pass jobs"],
      latestUserMessage: "Only government jobs",
    });

    expect(result.clarification).toBeNull();
    expect(result.filteredJobs.map((job) => job.id)).toEqual(["job-12th-govt"]);
    expect(result.summary.toLowerCase()).toContain("government jobs");
  });

  test("returns clarification for ambiguous salary query", () => {
    const result = resolveJobsFilterConversation({
      jobs,
      priorUserMessages: ["Show me 12th pass jobs"],
      latestUserMessage: "good salary",
    });

    expect(result.clarification).toContain("salary");
    expect(result.filteredJobs.map((job) => job.id)).toEqual([
      "job-12th-govt",
      "job-12th-private",
    ]);
  });

  test("reset query clears prior filters", () => {
    const result = resolveJobsFilterConversation({
      jobs,
      priorUserMessages: ["Show me 12th pass jobs", "Only government jobs"],
      latestUserMessage: "show all jobs and reset filters",
    });

    expect(result.clarification).toBeNull();
    expect(result.hasActiveFilters).toBe(false);
    expect(result.filteredJobs).toHaveLength(jobs.length);
  });

  test("matches around-salary queries using salary fields, not just content text", () => {
    const jobsWithStoredSalary = [
      ...jobs,
      createJob({
        id: "job-salary-field",
        title: "Hospital Administrator",
        company: "MBDA",
        location: "Shillong",
        content: "Graduate degree required.",
        salary: "Rs. 50,000/- (Negotiable based on education & experience)",
        sector: "government",
      }),
    ];

    const result = resolveJobsFilterConversation({
      jobs: jobsWithStoredSalary,
      priorUserMessages: [],
      latestUserMessage: "Any jobs around 50000 salary?",
    });

    expect(result.clarification).toBeNull();
    expect(result.filteredJobs.map((job) => job.id)).toContain("job-salary-field");
  });
});
