import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { isProductionEnvironment } from "@/lib/constants";
import { ChatSDKError } from "@/lib/errors";
import {
  DEFAULT_RAG_EMBEDDING_MODEL,
  MAX_RAG_EMBEDDABLE_CHARS,
} from "./constants";

const openaiEmbeddingClient =
  process.env.OPENAI_API_KEY !== undefined
    ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

export async function generateRagEmbedding(text: string) {
  const value = text.trim();

  if (!value) {
    throw new ChatSDKError(
      "bad_request:api",
      "Cannot generate embeddings for empty content"
    );
  }

  if (!openaiEmbeddingClient) {
    throw new ChatSDKError(
      "bad_request:api",
      "OpenAI API key is required for RAG embeddings"
    );
  }

  const modelId =
    process.env.RAG_EMBEDDING_MODEL ?? DEFAULT_RAG_EMBEDDING_MODEL;

  const normalized =
    value.length > MAX_RAG_EMBEDDABLE_CHARS
      ? value.slice(0, MAX_RAG_EMBEDDABLE_CHARS)
      : value;

  const result = await embed({
    model: openaiEmbeddingClient.embedding(modelId),
    value: normalized,
    experimental_telemetry: {
      isEnabled: isProductionEnvironment,
      functionId: "rag-embedding",
    },
  });

  if (!Array.isArray(result.embedding)) {
    throw new ChatSDKError(
      "bad_request:api",
      "Embedding provider returned an invalid vector"
    );
  }

  return {
    vector: result.embedding,
    model: modelId,
    dimensions: result.embedding.length,
  };
}
