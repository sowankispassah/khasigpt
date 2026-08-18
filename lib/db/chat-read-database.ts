import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ChatSDKError } from "@/lib/errors";
import { withTimeout } from "@/lib/utils/async";

type ChatReadDatabaseState = {
  client: ReturnType<typeof postgres>;
  db: PostgresJsDatabase;
};

type GlobalChatReadDatabaseState = typeof globalThis & {
  __khasigptChatReadDatabaseState?: ChatReadDatabaseState;
};

const globalChatReadDatabase = globalThis as GlobalChatReadDatabaseState;

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isSupabasePoolerUrl(value: string | undefined | null) {
  if (!value) {
    return false;
  }

  try {
    return new URL(value).hostname.endsWith(".pooler.supabase.com");
  } catch {
    return value.includes(".pooler.supabase.com");
  }
}

function pickPostgresUrl() {
  const candidates = [
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_DIRECT_URL,
    process.env.POSTGRES_PRISMA_URL,
  ].filter((value): value is string => Boolean(value));
  const configuredPoolerUrl = process.env.POSTGRES_POOLER_URL?.trim();
  const poolerCandidate =
    (configuredPoolerUrl && isSupabasePoolerUrl(configuredPoolerUrl)
      ? configuredPoolerUrl
      : undefined) ?? candidates.find((value) => isSupabasePoolerUrl(value));

  if (process.env.POSTGRES_USE_POOLER === "true") {
    return poolerCandidate ?? candidates[0] ?? null;
  }

  if (process.env.VERCEL === "1" && poolerCandidate) {
    return poolerCandidate;
  }

  return (
    candidates.find((value) => !isSupabasePoolerUrl(value)) ??
    poolerCandidate ??
    candidates[0] ??
    null
  );
}

function createChatReadDatabaseState(): ChatReadDatabaseState {
  const postgresUrl = pickPostgresUrl();
  if (!postgresUrl) {
    throw new ChatSDKError(
      "bad_request:configuration",
      "Chat database connection is not configured"
    );
  }

  const usesPooler = isSupabasePoolerUrl(postgresUrl);
  const chatReadPoolConfig = {
    max: parsePositiveInteger(process.env.POSTGRES_CHAT_READ_POOL_SIZE, 1),
    idle_timeout: parsePositiveInteger(
      process.env.POSTGRES_CHAT_READ_IDLE_TIMEOUT,
      5
    ),
    max_lifetime: parsePositiveInteger(
      process.env.POSTGRES_CHAT_READ_MAX_LIFETIME,
      60 * 5
    ),
    connect_timeout: parsePositiveInteger(
      process.env.POSTGRES_CHAT_READ_CONNECT_TIMEOUT ??
        process.env.POSTGRES_CONNECT_TIMEOUT ??
        process.env.PGCONNECT_TIMEOUT,
      3
    ),
    connection: {
      application_name:
        process.env.POSTGRES_CHAT_READ_APPLICATION_NAME ??
        `ai-chatbot-chat-read-${process.env.NODE_ENV ?? "development"}`,
      statement_timeout: parsePositiveInteger(
        process.env.POSTGRES_CHAT_READ_STATEMENT_TIMEOUT,
        3000
      ),
    },
    fetch_types: !usesPooler,
    max_pipeline: usesPooler ? 1 : 100,
    prepare: false,
  };
  const client = postgres(postgresUrl, chatReadPoolConfig);

  return {
    client,
    db: drizzle(client) as PostgresJsDatabase,
  };
}

function getChatReadDatabaseState() {
  globalChatReadDatabase.__khasigptChatReadDatabaseState ??=
    createChatReadDatabaseState();
  return globalChatReadDatabase.__khasigptChatReadDatabaseState;
}

function recycleChatReadDatabase(expectedState: ChatReadDatabaseState) {
  if (
    globalChatReadDatabase.__khasigptChatReadDatabaseState === expectedState
  ) {
    globalChatReadDatabase.__khasigptChatReadDatabaseState = undefined;
  }

  void expectedState.client.end({ timeout: 0 }).catch((error) => {
    console.warn("[chat.db] Failed to close an unhealthy connection.", error);
  });
}

function isRecoverableChatReadError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = "code" in error ? String(error.code) : "";
  return (
    error.message === "timeout" ||
    /connection|socket|terminated|econnreset|epipe|connect_timeout/i.test(
      `${code} ${error.message}`
    )
  );
}

function describeChatReadError(error: unknown) {
  if (!(error instanceof Error)) {
    return { code: "unknown", message: "Unknown database failure" };
  }

  return {
    code: "code" in error ? String(error.code) : error.name,
    message: error.message,
  };
}

export async function withChatReadDatabase<T>(
  label: string,
  operation: (db: PostgresJsDatabase) => Promise<T>,
  options: { retry?: boolean } = {}
) {
  const retry = options.retry ?? true;
  const operationTimeoutMs = parsePositiveInteger(
    process.env.POSTGRES_CHAT_READ_OPERATION_TIMEOUT_MS,
    3000
  );
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= (retry ? 2 : 1); attempt += 1) {
    const state = getChatReadDatabaseState();

    try {
      const result = await withTimeout(
        operation(state.db),
        operationTimeoutMs
      );
      console.info(`[chat.db] ${label} completed.`, {
        attempt,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const recoverable = isRecoverableChatReadError(error);
      console.error(`[chat.db] ${label} failed.`, {
        attempt,
        durationMs: Date.now() - startedAt,
        error: describeChatReadError(error),
        recoverable,
      });

      if (recoverable) {
        recycleChatReadDatabase(state);
      }

      if (!(recoverable && retry && attempt === 1)) {
        throw error;
      }
    }
  }

  throw new Error(`Chat database operation "${label}" failed.`);
}
