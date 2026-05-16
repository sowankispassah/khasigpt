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

export function appSettingCacheTagForKey(key: string) {
  return `app-setting:${key}`;
}

function getPostgresUrl() {
  const postgresUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!postgresUrl) {
    throw new Error("POSTGRES_URL or DATABASE_URL is not configured");
  }
  return postgresUrl;
}

function parseOr(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getLiteSqlClient() {
  if (!globalForLiteDb.__appSettingsLiteClient) {
    globalForLiteDb.__appSettingsLiteClient = postgres(getPostgresUrl(), {
      max: parseOr(process.env.POSTGRES_LITE_POOL_SIZE, 1),
      idle_timeout: parseOr(process.env.POSTGRES_IDLE_TIMEOUT, 20),
      max_lifetime: parseOr(process.env.POSTGRES_MAX_LIFETIME, 60 * 30),
      connect_timeout: parseOr(
        process.env.POSTGRES_CONNECT_TIMEOUT ?? process.env.PGCONNECT_TIMEOUT,
        10
      ),
      prepare: false,
    });
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

  try {
    const sql = getLiteSqlClient();
    const rows = await sql<LiteAppSetting[]>`
      select "key", "value", "updatedAt"
      from "AppSetting"
      where "key" = any(${uniqueKeys})
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
