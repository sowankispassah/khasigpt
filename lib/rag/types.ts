import type {
  RagEntry,
  RagEntryApprovalStatus,
  RagEntryStatus,
  RagEntryType,
} from "@/lib/db/schema";

export type SanitizedRagEntry = RagEntry & {
  tags: string[];
  models: string[];
  metadata: Record<string, unknown>;
  categoryName?: string | null;
};

export type RagVersionDiff = {
  fields: Record<
    string,
    {
      before: unknown;
      after: unknown;
    }
  >;
  textDelta?: string;
};

export type AdminRagEntry = {
  entry: SanitizedRagEntry;
  creator: {
    id: string;
    name: string;
    email: string | null;
  };
};

export type RagAnalyticsSummary = {
  totalEntries: number;
  activeEntries: number;
  inactiveEntries: number;
  archivedEntries: number;
  pendingEmbeddings: number;
  creatorStats: Array<{
    id: string;
    name: string;
    email: string | null;
    entryCount: number;
    activeEntries: number;
  }>;
};

export type RagUsageEventEntry = {
  id: string;
  title: string;
  status: RagEntryStatus;
  approvalStatus: RagEntryApprovalStatus;
  tags: string[];
  score: number;
  sourceUrl: string | null;
  chunkIndex?: number | null;
  chunkId?: string | null;
};

export type RagUsageEvent = {
  chatId: string;
  modelId: string;
  modelName: string;
  entries: RagUsageEventEntry[];
};

export type UpsertRagEntryInput = {
  id?: string | null;
  title: string;
  content: string;
  type: RagEntryType;
  status: RagEntryStatus;
  approvalStatus?: RagEntryApprovalStatus;
  tags: string[];
  models: string[];
  sourceUrl?: string | null;
  metadata?: Record<string, unknown>;
  categoryId?: string | null;
  personalForUserId?: string | null;
  approvedBy?: string | null;
};
