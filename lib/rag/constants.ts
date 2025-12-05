const toNumber = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const DEFAULT_RAG_MATCH_LIMIT = toNumber(
  process.env.RAG_MATCH_LIMIT,
  4
);
export const DEFAULT_RAG_MATCH_THRESHOLD = toNumber(
  process.env.RAG_MATCH_THRESHOLD,
  0.45
);

export const DEFAULT_RAG_EMBEDDING_MODEL =
  process.env.RAG_EMBEDDING_MODEL ?? "text-embedding-3-large";

export const DEFAULT_RAG_VERSION_HISTORY_LIMIT = toNumber(
  process.env.RAG_VERSION_HISTORY_LIMIT,
  25
);

export const RAG_SUPABASE_TABLE =
  process.env.RAG_SUPABASE_TABLE ?? "rag_embeddings";

export const RAG_SUPABASE_MATCH_FUNCTION =
  process.env.RAG_SUPABASE_MATCH_FUNCTION ?? "match_rag_embeddings";

export const CUSTOM_KNOWLEDGE_STORAGE_KEY = "rag.custom-knowledge";

export const RAG_CONFIDENCE_PERCENT = (score: number) => {
  const normalized = Math.max(0, Math.min(1, score));
  return Math.round(normalized * 100);
};

// Safety limits to avoid oversized prompts/embeddings.
export const MAX_RAG_CONTENT_CHARS = 8000;
export const MAX_RAG_EMBEDDABLE_CHARS = 16000;
export const DEFAULT_RAG_TIMEOUT_MS = toNumber(
  process.env.RAG_TIMEOUT_MS,
  5000
);
export const MAX_RAG_CONTEXT_CHARS = 4000;
export const MAX_RAG_CHUNK_CHARS = 1200;
export const RAG_CHUNK_OVERLAP_CHARS = 200;
