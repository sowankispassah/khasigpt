import "server-only";

import { ChatSDKError } from "@/lib/errors";
import type { RagEntry } from "@/lib/db/schema";
import {
  RAG_SUPABASE_TABLE,
  RAG_SUPABASE_MATCH_FUNCTION,
} from "./constants";
import { buildSupabaseMetadata } from "./utils";

type SupabaseConfig = {
  url: string;
  key: string;
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function hasSupabaseConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function ensureSupabaseConfig(): SupabaseConfig {
  if (!hasSupabaseConfig()) {
    throw new ChatSDKError(
      "bad_request:api",
      "Supabase credentials are required for RAG operations"
    );
  }

  return {
    // biome-ignore lint/style/noNonNullAssertion: guarded by hasSupabaseConfig.
    url: SUPABASE_URL!,
    // biome-ignore lint/style/noNonNullAssertion: guarded by hasSupabaseConfig.
    key: SUPABASE_SERVICE_ROLE_KEY!,
  };
}

async function supabaseRequest(
  path: string,
  init: RequestInit & { skipAuth?: boolean } = {}
) {
  const { url, key } = ensureSupabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${url}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ChatSDKError(
      "bad_request:api",
      `Supabase request failed (${response.status}): ${message}`
    );
  }

  const contentLength = response.headers.get("content-length");
  if (response.status === 204 || contentLength === "0") {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ChatSDKError(
      "bad_request:api",
      `Supabase returned invalid JSON: ${(error as Error).message}`
    );
  }
}

export async function upsertSupabaseEmbedding({
  entry,
  embedding,
}: {
  entry: RagEntry;
  embedding: number[];
}) {
  await supabaseRequest(
    `/rest/v1/${RAG_SUPABASE_TABLE}?on_conflict=rag_entry_id`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([
        {
          rag_entry_id: entry.id,
          content: entry.content,
          metadata: buildSupabaseMetadata(entry),
          status: entry.status,
          models: entry.models,
          embedding,
        },
      ]),
    }
  );
}

export async function patchSupabaseEmbedding(entry: RagEntry) {
  await supabaseRequest(
    `/rest/v1/${RAG_SUPABASE_TABLE}?rag_entry_id=eq.${entry.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        content: entry.content,
        metadata: buildSupabaseMetadata(entry),
        status: entry.status,
        models: entry.models,
      }),
    }
  );
}

export async function deleteSupabaseEmbedding(ragEntryId: string) {
  await supabaseRequest(
    `/rest/v1/${RAG_SUPABASE_TABLE}?rag_entry_id=eq.${ragEntryId}`,
    {
      method: "DELETE",
    }
  );
}

export type SupabaseRagMatch = {
  rag_entry_id: string;
  score: number;
  content: string;
  metadata: Record<string, unknown> | null;
};

export async function searchSupabaseEmbeddings({
  embedding,
  limit,
  threshold,
  modelIds,
  status = "active",
}: {
  embedding: number[];
  limit: number;
  threshold: number;
  modelIds: string[] | null;
  status?: string;
}): Promise<SupabaseRagMatch[]> {
  const payload = {
    query_embedding: embedding,
    match_count: limit,
    match_threshold: threshold,
    filter_status: status,
    filter_models: modelIds?.length ? modelIds : null,
  };

  const result = await supabaseRequest(
    `/rest/v1/rpc/${RAG_SUPABASE_MATCH_FUNCTION}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

  if (!Array.isArray(result)) {
    return [];
  }

  return result as SupabaseRagMatch[];
}
