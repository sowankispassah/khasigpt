import type {
  RagEmbeddingStatus,
  RagEntryApprovalStatus,
  RagEntryStatus,
} from "@/lib/db/schema";
import type { QuestionPaperRecord } from "@/lib/study/types";

export type JobPostingMetadata = {
  category: "job_postings";
  jobs_kind: "job_posting";
  job_id: string;
  job_title: string;
  company: string;
  location: string;
  employment_type: string;
  study_exam: string;
  study_role: string;
  study_years: number[];
  study_tags: string[];
  tags: string[];
  parse_error?: string | null;
};

export type JobPostingRecord = {
  id: string;
  title: string;
  content: string;
  company: string;
  location: string;
  employmentType: string;
  studyExam: string;
  studyRole: string;
  studyYears: number[];
  studyTags: string[];
  tags: string[];
  sourceUrl: string | null;
  status: RagEntryStatus;
  approvalStatus: RagEntryApprovalStatus;
  embeddingStatus: RagEmbeddingStatus;
  metadata: Record<string, unknown>;
  models: string[];
  categoryId: string | null;
  parseError?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type JobCard = {
  id: string;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  studyExam: string;
  studyRole: string;
  studyYears: number[];
  studyTags: string[];
  tags: string[];
  sourceUrl: string | null;
};

export type JobStudyLinkResult = {
  papers: QuestionPaperRecord[];
  source: "exact" | "exam_role" | "tags" | "none";
};
