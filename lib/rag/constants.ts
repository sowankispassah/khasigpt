const toNumber = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const DEFAULT_RAG_VERSION_HISTORY_LIMIT = toNumber(
  process.env.RAG_VERSION_HISTORY_LIMIT,
  25
);
