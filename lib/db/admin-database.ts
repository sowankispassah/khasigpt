import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ChatSDKError } from "@/lib/errors";
import { withTimeout } from "@/lib/utils/async";

type AdminDatabaseState = {
  client: ReturnType<typeof postgres>;
  db: ReturnType<typeof drizzle>;
  healthCheck: Promise<void> | null;
  lastHealthyAt: number;
};

type GlobalAdminDatabaseState = typeof globalThis & {
  __khasigptAdminDatabaseState?: AdminDatabaseState;
};

const globalAdminDatabase = globalThis as GlobalAdminDatabaseState;

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

function createAdminDatabaseState(): AdminDatabaseState {
  const postgresUrl = pickPostgresUrl();
  if (!postgresUrl) {
    throw new ChatSDKError(
      "bad_request:configuration",
      "Admin database connection is not configured"
    );
  }

  const usesPooler = isSupabasePoolerUrl(postgresUrl);
  const adminPoolConfig = {
    max: parsePositiveInteger(process.env.POSTGRES_ADMIN_POOL_SIZE, 1),
    idle_timeout: parsePositiveInteger(
      process.env.POSTGRES_ADMIN_IDLE_TIMEOUT,
      5
    ),
    max_lifetime: parsePositiveInteger(
      process.env.POSTGRES_ADMIN_MAX_LIFETIME,
      60 * 5
    ),
    connect_timeout: parsePositiveInteger(
      process.env.POSTGRES_ADMIN_CONNECT_TIMEOUT ??
        process.env.POSTGRES_CONNECT_TIMEOUT ??
        process.env.PGCONNECT_TIMEOUT,
      3
    ),
    connection: {
      application_name:
        process.env.POSTGRES_ADMIN_APPLICATION_NAME ??
        `ai-chatbot-admin-${process.env.NODE_ENV ?? "development"}`,
      statement_timeout: parsePositiveInteger(
        process.env.POSTGRES_ADMIN_STATEMENT_TIMEOUT,
        3000
      ),
    },
    fetch_types: !usesPooler,
    max_pipeline: usesPooler ? 1 : 100,
    prepare: false,
  };
  const client = postgres(postgresUrl, adminPoolConfig);

  return {
    client,
    db: drizzle(client),
    healthCheck: null,
    lastHealthyAt: Date.now(),
  };
}

function getAdminDatabaseState() {
  globalAdminDatabase.__khasigptAdminDatabaseState ??=
    createAdminDatabaseState();
  return globalAdminDatabase.__khasigptAdminDatabaseState;
}

function recycleAdminDatabase(expectedState: AdminDatabaseState) {
  if (globalAdminDatabase.__khasigptAdminDatabaseState === expectedState) {
    globalAdminDatabase.__khasigptAdminDatabaseState = undefined;
  }

  void expectedState.client.end({ timeout: 0 }).catch((error) => {
    console.warn("[admin.db] Failed to close an unhealthy connection.", error);
  });

  return getAdminDatabaseState();
}

async function verifyAdminDatabaseConnection() {
  let state = getAdminDatabaseState();
  const healthTtlMs = parsePositiveInteger(
    process.env.POSTGRES_ADMIN_HEALTH_TTL_MS,
    5000
  );

  if (Date.now() - state.lastHealthyAt <= healthTtlMs) {
    return state;
  }

  if (!state.healthCheck) {
    const checkedState = state;
    state.healthCheck = (async () => {
      const healthTimeoutMs = parsePositiveInteger(
        process.env.POSTGRES_ADMIN_HEALTH_TIMEOUT_MS,
        1250
      );

      try {
        await withTimeout(
          checkedState.client`SELECT 1 AS "healthy"`,
          healthTimeoutMs
        );
        checkedState.lastHealthyAt = Date.now();
      } catch (error) {
        console.warn("[admin.db] Health check failed; recycling connection.", {
          error,
          healthTimeoutMs,
        });
        recycleAdminDatabase(checkedState);
      } finally {
        checkedState.healthCheck = null;
      }
    })();
  }

  await state.healthCheck;
  state = getAdminDatabaseState();
  return state;
}

function isRecoverableAdminDatabaseError(error: unknown) {
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

function describeAdminDatabaseError(error: unknown) {
  if (!(error instanceof Error)) {
    return { code: "unknown", message: "Unknown database failure" };
  }

  return {
    code: "code" in error ? String(error.code) : error.name,
    message: error.message,
  };
}

async function runAdminDatabaseOperation<T>({
  label,
  operation,
  retry,
}: {
  label: string;
  operation: (
    db: ReturnType<typeof drizzle>,
    client: ReturnType<typeof postgres>
  ) => Promise<T>;
  retry: boolean;
}) {
  const operationTimeoutMs = parsePositiveInteger(
    process.env.POSTGRES_ADMIN_OPERATION_TIMEOUT_MS,
    2500
  );
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= (retry ? 2 : 1); attempt += 1) {
    const state = await verifyAdminDatabaseConnection();

    try {
      const result = await withTimeout(
        operation(state.db, state.client),
        operationTimeoutMs
      );
      state.lastHealthyAt = Date.now();
      console.info(`[admin.db] ${label} completed.`, {
        attempt,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const recoverable = isRecoverableAdminDatabaseError(error);
      console.error(`[admin.db] ${label} failed.`, {
        attempt,
        durationMs: Date.now() - startedAt,
        error: describeAdminDatabaseError(error),
        recoverable,
      });

      if (recoverable) {
        recycleAdminDatabase(state);
      }

      if (!(recoverable && retry && attempt === 1)) {
        throw error;
      }
    }
  }

  throw new Error(`Admin database operation "${label}" failed.`);
}

export function withAdminDatabase<T>(
  label: string,
  operation: (
    db: ReturnType<typeof drizzle>,
    client: ReturnType<typeof postgres>
  ) => Promise<T>,
  options: { retry?: boolean } = {}
) {
  return runAdminDatabaseOperation({
    label,
    operation,
    retry: options.retry ?? true,
  });
}
