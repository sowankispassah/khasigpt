import "server-only";

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

function parsePositiveInteger(value: string | undefined | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getConfiguredAdminPoolSize() {
  return (
    parsePositiveInteger(process.env.POSTGRES_LITE_POOL_SIZE) ??
    parsePositiveInteger(process.env.POSTGRES_POOL_SIZE) ??
    (process.env.NODE_ENV === "development"
      ? 5
      : hasConfiguredSupabasePoolerUrl()
        ? 1
        : 2)
  );
}

function getConfiguredAdminDbReadConcurrency() {
  return parsePositiveInteger(process.env.ADMIN_SETTINGS_DB_READ_CONCURRENCY);
}

function hasConfiguredSupabasePoolerUrl() {
  const candidates = [
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_DIRECT_URL,
    process.env.POSTGRES_PRISMA_URL,
  ].filter(Boolean);

  return candidates.some((value) => isSupabasePoolerUrl(value));
}

export function shouldSerializeAdminDbReads() {
  if (process.env.ADMIN_SETTINGS_SERIALIZE_DB_READS === "true") {
    return true;
  }
  if (process.env.ADMIN_SETTINGS_SERIALIZE_DB_READS === "false") {
    return false;
  }

  const onlyOneDbConnection = getConfiguredAdminPoolSize() <= 1;
  if (process.env.POSTGRES_USE_POOLER === "true") {
    return onlyOneDbConnection;
  }

  const hasPoolerUrl = hasConfiguredSupabasePoolerUrl();
  if (process.env.VERCEL === "1" && hasPoolerUrl) {
    return onlyOneDbConnection;
  }

  return onlyOneDbConnection && hasPoolerUrl;
}

function getAdminDbReadConcurrency(taskCount: number) {
  if (taskCount <= 1) {
    return taskCount;
  }

  const explicitConcurrency = getConfiguredAdminDbReadConcurrency();
  if (explicitConcurrency !== null) {
    return Math.min(taskCount, explicitConcurrency);
  }

  if (shouldSerializeAdminDbReads()) {
    return 1;
  }

  if (process.env.ADMIN_SETTINGS_SERIALIZE_DB_READS === "false") {
    return taskCount;
  }

  const poolSize = getConfiguredAdminPoolSize();
  const usesPooler =
    process.env.POSTGRES_USE_POOLER === "true" ||
    (process.env.VERCEL === "1" && hasConfiguredSupabasePoolerUrl());

  if (!usesPooler) {
    return taskCount;
  }

  return Math.max(1, Math.min(taskCount, poolSize - 1, 2));
}

export async function resolveAdminDbReadGroup<
  const T extends readonly unknown[],
>(tasks: { [K in keyof T]: () => Promise<T[K]> }): Promise<T> {
  const concurrency = getAdminDbReadConcurrency(tasks.length);

  if (concurrency >= tasks.length) {
    return Promise.all(tasks.map((task) => task())) as unknown as Promise<T>;
  }

  const results = new Array<unknown>(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker())
  );
  return results as unknown as T;
}
