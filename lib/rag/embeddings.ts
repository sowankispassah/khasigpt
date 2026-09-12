import "server-only";

const DEFAULT_MODEL = "gemini-embedding-2";
const OUTPUT_DIMENSIONS = 768;
const BATCH_SIZE = 32;
const REQUEST_TIMEOUT_MS = 20_000;

type BatchEmbeddingResponse = {
  embeddings?: Array<{ values?: number[] }>;
};

export function getRagEmbeddingModel(): string {
  return process.env.RAG_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
}
function getGoogleApiKey(): string {
  const key =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key?.trim()) {
    throw new Error("Google embedding API key is not configured.");
  }
  return key.trim();
}

async function embedBatch(texts: string[], signal?: AbortSignal) {
  const model = getRagEmbeddingModel();
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": getGoogleApiKey(),
        },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            outputDimensionality: OUTPUT_DIMENSIONS,
          })),
        }),
        cache: "no-store",
        signal: combinedSignal,
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Embedding request failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as BatchEmbeddingResponse;
    const embeddings = payload.embeddings?.map((item) => item.values ?? []) ?? [];
    if (
      embeddings.length !== texts.length ||
      embeddings.some((values) => values.length !== OUTPUT_DIMENSIONS)
    ) {
      throw new Error("Embedding response had an unexpected shape.");
    }
    return embeddings;
  } finally {
    clearTimeout(timeout);
  }
}

export async function embedRagDocuments(
  documents: Array<{ title: string; text: string }>,
  signal?: AbortSignal,
): Promise<number[][]> {
  const output: number[][] = [];
  for (let index = 0; index < documents.length; index += BATCH_SIZE) {
    const batch = documents.slice(index, index + BATCH_SIZE);
    output.push(
      ...(await embedBatch(
        batch.map(({ title, text }) => `title: ${title} | text: ${text}`),
        signal,
      )),
    );
  }
  return output;
}

export async function embedRagQuery(
  query: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const [embedding] = await embedBatch(
    [`task: search result | query: ${query}`],
    signal,
  );
  if (!embedding) {
    throw new Error("Embedding response was empty.");
  }
  return embedding;
}
