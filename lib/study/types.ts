import type {
  RagEmbeddingStatus,
  RagEntryApprovalStatus,
  RagEntryStatus,
} from "@/lib/db/schema";

export type QuestionPaperMetadata = {
  category: "question_papers";
  exam: string;
  role: string;
  year: number;
  paper_id: string;
  paper_title: string;
  language: string;
  tags: string[];
  parse_error?: string | null;
};

export type QuestionPaperRecord = {
  id: string;
  title: string;
  content: string;
  exam: string;
  role: string;
  year: number;
  language: string;
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

export type StudyCard = {
  id: string;
  title: string;
  exam: string;
  role: string;
  year: number;
  language: string;
  tags: string[];
  sourceUrl: string | null;
};

export type StudyFacetOptions = {
  exams: string[];
  roles: string[];
  years: number[];
};

export type StudyFilters = {
  exam: string | null;
  role: string | null;
};

export type StudyPaperCard = {
  id: string;
  title: string;
  exam: string;
  role: string;
  year: number;
  language: string;
  tags: string[];
  sourceUrl: string | null;
};

export type StudyChipGroup = {
  label: string;
  chips: string[];
};

export type StudyQuestionReference = {
  paperId: string;
  title: string;
  preview: string;
};

export type StudyChip = {
  key: string;
  text: string;
  prompt: string;
  category: "exam" | "role" | "year" | "topic";
};

export type StudyAssistChipGroup = {
  id: string;
  title: string;
  chips: StudyChip[];
};
