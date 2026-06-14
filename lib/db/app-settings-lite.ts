import { setDefaultResultOrder } from "node:dns";
import postgres from "postgres";
import { normalizeAppSettingValueForWrite } from "@/lib/db/app-setting-validation";
import {
  assertFeatureSettingWriteAllowed,
  type FeatureSettingWriteContext,
  isFeatureAccessSettingKey,
} from "@/lib/settings/feature-setting-guard";

export type LiteAppSetting = {
  key: string;
  value: unknown;
  updatedAt: Date;
};

type AuditLogInput = {
  actorId: string;
  action: string;
  target: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  subjectUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  device?: string | null;
};

const APP_SETTING_CACHE_TAG = "app-settings";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LiteSqlClient = ReturnType<typeof postgres>;

const globalForLiteDb = globalThis as typeof globalThis & {
  __appSettingsLiteClient?: LiteSqlClient;
};

try {
  setDefaultResultOrder("ipv4first");
} catch {
  // Older Node runtimes may not support setDefaultResultOrder; ignore.
}

export function appSettingCacheTagForKey(key: string) {
  return `app-setting:${key}`;
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

function isProductionBuildPhase() {
  return (
    process.env.APP_BUILD_PHASE === "production-build" ||
    process.env.NEXT_PHASE === "phase-production-build"
  );
}

function getPostgresUrl() {
  const candidates = [
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_DIRECT_URL,
    process.env.POSTGRES_PRISMA_URL,
  ].filter((value): value is string => Boolean(value));
  const poolerCandidate =
    process.env.POSTGRES_POOLER_URL ??
    candidates.find((value) => isSupabasePoolerUrl(value));

  if (process.env.POSTGRES_USE_POOLER === "true") {
    const poolerUrl = poolerCandidate ?? candidates[0];
    if (!poolerUrl) {
      throw new Error(
        "POSTGRES_URL, DATABASE_URL, or POSTGRES_POOLER_URL is not configured"
      );
    }
    return poolerUrl;
  }

  if (process.env.VERCEL === "1" && poolerCandidate) {
    return poolerCandidate;
  }

  const directCandidate = candidates.find(
    (value) => !isSupabasePoolerUrl(value)
  );
  const postgresUrl =
    directCandidate ?? poolerCandidate ?? candidates[0];
  if (!postgresUrl) {
    throw new Error(
      "POSTGRES_URL, DATABASE_URL, or POSTGRES_POOLER_URL is not configured"
    );
  }
  return postgresUrl;
}

function parseOr(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getLiteSqlClient() {
  if (!globalForLiteDb.__appSettingsLiteClient) {
    const postgresUrl = getPostgresUrl();
    const usesPooler = isSupabasePoolerUrl(postgresUrl);
    const poolConfig = {
      max: parseOr(
        process.env.POSTGRES_LITE_POOL_SIZE,
        usesPooler ? 3 : process.env.NODE_ENV === "development" ? 5 : 3
      ),
      idle_timeout: parseOr(process.env.POSTGRES_IDLE_TIMEOUT, 20),
      max_lifetime: parseOr(process.env.POSTGRES_MAX_LIFETIME, 60 * 30),
      connect_timeout: parseOr(
        process.env.POSTGRES_CONNECT_TIMEOUT ?? process.env.PGCONNECT_TIMEOUT,
        usesPooler ? 5 : 10
      ),
      statement_timeout: parseOr(process.env.POSTGRES_STATEMENT_TIMEOUT, 20_000),
      application_name:
        process.env.POSTGRES_APPLICATION_NAME ??
        `ai-chatbot-lite-${process.env.NODE_ENV ?? "development"}`,
      fetch_types: !usesPooler,
      max_pipeline: usesPooler ? 1 : 100,
      prepare: false,
    };
    globalForLiteDb.__appSettingsLiteClient = postgres(postgresUrl, poolConfig);
  }

  return globalForLiteDb.__appSettingsLiteClient;
}

function normalizeSettingKeys(keys: string[]) {
  return Array.from(
    new Set(
      keys
        .map((key) => key.trim())
        .filter((key): key is string => key.length > 0)
    )
  );
}

function isMissingRelationError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "42P01"
  );
}

function isValidUuid(value: string | null | undefined) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function sanitizeAuditString(
  value: string | null | undefined,
  maxLength = 512
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function getLiteAppSettingsByKeysUncached(keys: string[]) {
  const uniqueKeys = normalizeSettingKeys(keys);
  if (uniqueKeys.length === 0) {
    return [];
  }
  if (isProductionBuildPhase()) {
    return [];
  }

  try {
    const sql = getLiteSqlClient();
    const rows = await sql<LiteAppSetting[]>`
      select "key", "value", "updatedAt"
      from "AppSetting"
      where "key" in ${sql(uniqueKeys)}
    `;
    return rows;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getLiteAppSettingUncached<T>(key: string) {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    return null;
  }
  if (isProductionBuildPhase()) {
    return null;
  }

  try {
    const sql = getLiteSqlClient();
    const rows = await sql<Array<{ value: T }>>`
      select "value"
      from "AppSetting"
      where "key" = ${normalizedKey}
      limit 1
    `;
    return rows[0]?.value ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }
}

export async function setLiteAppSetting<T>({
  key,
  value,
}: {
  key: string;
  value: T;
},
options?: {
  featureSettingWrite?: FeatureSettingWriteContext;
}) {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    throw new Error("invalid_setting_key");
  }

  const normalizedValue = normalizeAppSettingValueForWrite(
    normalizedKey,
    value
  );

  const sql = getLiteSqlClient();
  let previousValue: unknown = null;
  if (isFeatureAccessSettingKey(normalizedKey)) {
    const previousRows = await sql<Array<{ value: unknown }>>`
      select "value"
      from "AppSetting"
      where "key" = ${normalizedKey}
      limit 1
    `;
    previousValue = previousRows[0]?.value ?? null;
  }

  assertFeatureSettingWriteAllowed({
    context: options?.featureSettingWrite,
    key: normalizedKey,
    previousValue,
    value: normalizedValue,
    writer: "setLiteAppSetting",
  });

  const jsonValue = normalizedValue as Parameters<typeof sql.json>[0];
  await sql`
    insert into "AppSetting" ("key", "value", "updatedAt")
    values (${normalizedKey}, ${sql.json(jsonValue)}, now())
    on conflict ("key") do update set
      "value" = excluded."value",
      "updatedAt" = excluded."updatedAt"
  `;
}

export async function createLiteAuditLogEntry({
  actorId,
  action,
  target,
  metadata,
  subjectUserId,
  ipAddress,
  userAgent,
  device,
}: AuditLogInput) {
  if (!isValidUuid(actorId)) {
    return null;
  }

  const targetUserId =
    typeof target?.userId === "string" ? target.userId : null;
  const resolvedSubjectUserId =
    (isValidUuid(subjectUserId) ? subjectUserId : null) ??
    (isValidUuid(targetUserId) ? targetUserId : null);

  try {
    const sql = getLiteSqlClient();
    const targetJson = target as Parameters<typeof sql.json>[0];
    const metadataJson = metadata as Parameters<typeof sql.json>[0];
    const rows = await sql<Array<{ id: string }>>`
      insert into "AuditLog" (
        "actorId",
        "action",
        "target",
        "metadata",
        "subjectUserId",
        "ipAddress",
        "userAgent",
        "device"
      )
      values (
        ${actorId},
        ${action},
        ${sql.json(targetJson)},
        ${metadata ? sql.json(metadataJson) : null},
        ${resolvedSubjectUserId},
        ${sanitizeAuditString(ipAddress, 128)},
        ${sanitizeAuditString(userAgent)},
        ${sanitizeAuditString(device, 64)}
      )
      returning "id"
    `;
    return rows[0] ?? null;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }
}

export { APP_SETTING_CACHE_TAG };
