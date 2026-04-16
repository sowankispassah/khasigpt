import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { resolveJobsFilterConversation } from "@/lib/jobs/filtering";
import { toJobListItem } from "@/lib/jobs/list-items";
import { resolveJobSector } from "@/lib/jobs/sector";
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
    parseError: overrides.parseError ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

test.describe("job sector resolution", () => {
  test("classifies government jobs from government hosts or authorities", () => {
    expect(
      resolveJobSector({
        title: "Office Assistant",
        company: "Tripura Public Service Commission",
      })
    ).toBe("government");

    expect(
      resolveJobSector({
        title: "Programme Associate",
        company: "Meghalaya Basin Development Authority",
        sourceUrl: "https://mbda.gov.in/recruitment/programme-associate",
      })
    ).toBe("government");
  });

  test("classifies private jobs from corporate naming signals", () => {
    expect(
      resolveJobSector({
        title: "Software Engineer",
        company: "Acme Pvt Ltd",
      })
    ).toBe("private");

    expect(
      resolveJobSector({
        title: "Backend Developer",
        company: "Northstar Technologies",
      })
    ).toBe("private");

    expect(
      resolveJobSector({
        title: "Analyst",
        company: "Market Pulse LLP",
      })
    ).toBe("private");
  });

  test("returns unknown when evidence is weak or conflicting", () => {
    expect(
      resolveJobSector({
        title: "Assistant",
        company: "Northstar Services",
        description: "Support work for government partners and partner services.",
      })
    ).toBe("unknown");
  });

  test("government domains override weaker private wording in the body", () => {
    expect(
      resolveJobSector({
        title: "Coordinator",
        company: "Meghalaya Basin Development Authority",
        sourceUrl: "https://mbda.gov.in/recruitment/coordinator",
        description: "Private company coordination with corporate partners.",
      })
    ).toBe("government");
  });

  test("official government PDF URLs classify portal-listed jobs as government", () => {
    expect(
      resolveJobSector({
        title: "NEIGRIHMS Recruitment 2026",
        company: "meghalayaportal.com",
        source: "Meghalayaportal",
        sourceUrl: "https://www.meghalayaportal.com/2025/07/neigrihms-recruitment-2025-lab.html",
        applicationLink:
          "https://www.meghalayaportal.com/2025/07/neigrihms-recruitment-2025-lab.html",
        pdfSourceUrl:
          "https://neigrihms.gov.in/Latest%20News/estt-2/2026/Walk%20in%20interview%20for%20recruitment%20of%20Assistant%20Professor%20on%20adhoc%20basis.pdf",
      })
    ).toBe("government");
  });

  test("jobs filtering uses canonical sector values instead of text coincidence", () => {
    const jobs = [
      createJob({
        id: "gov-sector",
        title: "Office Assistant",
        company: "Public Hiring Board",
        content: "12th pass required. Salary Rs 18000 to Rs 22000 per month.",
        sector: "government",
      }),
      createJob({
        id: "private-sector",
        title: "Store Helper",
        company: "Retail Hub",
        content: "12th pass required. Salary Rs 16000 to Rs 20000 per month.",
        sector: "private",
      }),
    ];

    const result = resolveJobsFilterConversation({
      jobs,
      priorUserMessages: [],
      latestUserMessage: "Only government jobs",
    });

    expect(result.filteredJobs.map((job) => job.id)).toEqual(["gov-sector"]);
  });

  test("list items preserve the visible type label", async () => {
    const item = await toJobListItem(
      createJob({
        sector: "government",
        employmentType: "government",
      })
    );

    expect(item.employmentType).toBe("government");
  });
});
