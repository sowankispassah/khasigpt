import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { toJobListItem } from "@/lib/jobs/list-items";
import {
  extractSalaryText,
  NO_SALARY_LABEL,
  type ResolvedSalaryInfo,
  resolveJobSalaryInfo,
} from "@/lib/jobs/salary";
import type { JobPostingRecord } from "@/lib/jobs/types";

function createJob(overrides: Partial<JobPostingRecord>): JobPostingRecord {
  const now = new Date("2026-03-06T00:00:00.000Z");
  return {
    id: overrides.id ?? randomUUID(),
    title: overrides.title ?? "General Assistant",
    content: overrides.content ?? "No description available.",
    company: overrides.company ?? "Acme Ltd",
    location: overrides.location ?? "Shillong",
    sector: overrides.sector ?? "unknown",
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

function expectSalaryInfo(
  result: ResolvedSalaryInfo,
  expected: {
    summary: string;
    entries: Array<{ role: string; salary: string }>;
  }
) {
  expect(result.summary).toBe(expected.summary);
  expect(result.entries).toEqual(expected.entries);
}

test.describe("jobs salary parsing", () => {
  test("extracts single labelled salary", () => {
    const result = resolveJobSalaryInfo({
      content:
        "Salary: Rs 27,800/- (Consolidated) Essential Qualification: Four-year integrated degree course.",
    });

    expectSalaryInfo(result, {
      summary: "Rs 27,800/- (Consolidated)",
      entries: [],
    });
  });

  test("extracts remuneration table salary from flattened PDF text", () => {
    const result = resolveJobSalaryInfo({
      pdfContent:
        "Sl. No. Vacant Position Essential Qualification & Required Experience No. of vacancy Place of Posting Remuneration 1 Senior Project Fellow Essential Qualification: Master Degree in Science. 01 Shillong Rs. 28,000/- + HRA Interested and eligible candidates are invited.",
    });

    expectSalaryInfo(result, {
      summary: "Rs. 28,000/- + HRA",
      entries: [
        {
          role: "Senior Project Fellow",
          salary: "Rs. 28,000/- + HRA",
        },
      ],
    });
  });

  test("extracts pay table salary from flattened PDF text", () => {
    const result = resolveJobSalaryInfo({
      pdfContent:
        "Sl. No. Position Qualifications/Experiences/Skills Place of Posting No. of Vacancy Pay 1.1 Hospital Administrator Qualifications: Master's degree in Healthcare/Hospital Management. All Districts 14 Rs. 50,000/- (Negotiable based on education & experience) 2. To apply for the positions listed above.",
    });

    expectSalaryInfo(result, {
      summary: "Rs. 50,000/- (Negotiable based on education & experience)",
      entries: [
        {
          role: "Hospital Administrator",
          salary: "Rs. 50,000/- (Negotiable based on education & experience)",
        },
      ],
    });
  });

  test("keeps pay level text when no rupee amount is present", () => {
    const result = resolveJobSalaryInfo({
      pdfContent:
        "Name of the Post & Scale of Pay Assistant Conservator of Forest under Forest & Environment Department (Level 15 of Revised Pay Structure.)",
    });

    expectSalaryInfo(result, {
      summary: "Level 15 of Revised Pay Structure",
      entries: [],
    });
  });

  test("summarizes multiple role salaries as a range", () => {
    const result = resolveJobSalaryInfo({
      pdfContent:
        "Sl. No. Positions Essential Qualifications No. of Vacancy Monthly Emolument 1.1 Manager Qualifications: MBA. 01 Shillong Rs. 50,000/- 1.2 Field Coordinator Qualifications: Graduate. 02 Tura Rs. 20,000/- + HRA",
    });

    expectSalaryInfo(result, {
      summary: "Rs. 20,000 - Rs. 50,000 across 2 roles",
      entries: [
        {
          role: "Manager",
          salary: "Rs. 50,000/-",
        },
        {
          role: "Field Coordinator",
          salary: "Rs. 20,000/- + HRA",
        },
      ],
    });
  });

  test("summarizes same salary across multiple roles", () => {
    const result = resolveJobSalaryInfo({
      pdfContent:
        "Sl. No. Positions Essential Qualifications No. of Vacancy Monthly Emolument 1.1 Programme Associate Qualifications: Graduate. 01 Shillong Rs. 25,000/- 1.2 Field Coordinator Qualifications: Graduate. 01 Tura Rs. 25,000/-",
    });

    expectSalaryInfo(result, {
      summary: "Rs. 25,000/- across 2 roles",
      entries: [
        {
          role: "Programme Associate",
          salary: "Rs. 25,000/-",
        },
        {
          role: "Field Coordinator",
          salary: "Rs. 25,000/-",
        },
      ],
    });
  });

  test("does not treat application fee as salary", () => {
    expect(
      extractSalaryText("Application fee: Rs 100/- to be paid online only.")
    ).toBeNull();
  });

  test("uses NA when no salary is available", () => {
    const result = resolveJobSalaryInfo({
      content: "Recruitment notice. Apply online. No salary details mentioned.",
    });

    expectSalaryInfo(result, {
      summary: NO_SALARY_LABEL,
      entries: [],
    });
  });

  test("maps list item salary label to summary for multi-role postings", async () => {
    const job = createJob({
      title: "MBMA Recruitment 2026",
      pdfContent:
        "Sl. No. Positions Essential Qualifications No. of Vacancy Monthly Emolument 1.1 Manager Qualifications: MBA. 01 Shillong Rs. 50,000/- 1.2 Field Coordinator Qualifications: Graduate. 02 Tura Rs. 20,000/- + HRA",
    });

    const item = await toJobListItem(job);

    expect(item.salaryLabel).toBe("Rs. 20,000 - Rs. 50,000 across 2 roles");
  });
});
