import "server-only";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { type User, user } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";

export type AuthDbUser = Pick<
  User,
  | "id"
  | "email"
  | "password"
  | "role"
  | "isActive"
  | "allowPersonalKnowledge"
  | "image"
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "updatedAt"
>;

type AuthDbState = {
  __khasigptAuthPostgresClient?: ReturnType<typeof postgres>;
  __khasigptAuthDrizzleDb?: ReturnType<typeof drizzle>;
};

const globalAuthDbState = globalThis as typeof globalThis & AuthDbState;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const authUserColumns = {
  id: user.id,
  email: user.email,
  password: user.password,
  role: user.role,
  isActive: user.isActive,
  allowPersonalKnowledge: user.allowPersonalKnowledge,
  image: user.image,
  firstName: user.firstName,
  lastName: user.lastName,
  dateOfBirth: user.dateOfBirth,
  updatedAt: user.updatedAt,
};

function parseOr(value: string | undefined, fallback: number) {
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
  const poolerCandidate =
    process.env.POSTGRES_POOLER_URL ??
    candidates.find((value) => isSupabasePoolerUrl(value));

  if (process.env.POSTGRES_USE_POOLER === "true") {
    return poolerCandidate ?? candidates[0] ?? null;
  }

  if (process.env.VERCEL === "1" && poolerCandidate) {
    return poolerCandidate;
  }

  const directCandidate = candidates.find(
    (value) => !isSupabasePoolerUrl(value)
  );
  return directCandidate ?? poolerCandidate ?? candidates[0] ?? null;
}

function getAuthDb() {
  if (!globalAuthDbState.__khasigptAuthPostgresClient) {
    const postgresUrl = pickPostgresUrl();
    if (!postgresUrl) {
      throw new ChatSDKError(
        "bad_request:configuration",
        "POSTGRES_URL, DATABASE_URL, or POSTGRES_POOLER_URL is not configured"
      );
    }

    const usesPooler = isSupabasePoolerUrl(postgresUrl);
    const poolConfig = {
      max: parseOr(
        process.env.POSTGRES_AUTH_POOL_SIZE,
        usesPooler ? 2 : process.env.NODE_ENV === "development" ? 3 : 2
      ),
      idle_timeout: parseOr(process.env.POSTGRES_AUTH_IDLE_TIMEOUT, 10),
      max_lifetime: parseOr(process.env.POSTGRES_AUTH_MAX_LIFETIME, 60 * 15),
      connect_timeout: parseOr(
        process.env.POSTGRES_AUTH_CONNECT_TIMEOUT ??
          process.env.POSTGRES_CONNECT_TIMEOUT ??
          process.env.PGCONNECT_TIMEOUT,
        usesPooler ? 3 : 5
      ),
      connection: {
        application_name:
          process.env.POSTGRES_AUTH_APPLICATION_NAME ??
          `ai-chatbot-auth-${process.env.NODE_ENV ?? "development"}`,
        statement_timeout: parseOr(
          process.env.POSTGRES_AUTH_STATEMENT_TIMEOUT,
          3500
        ),
      },
      fetch_types: !usesPooler,
      max_pipeline: usesPooler ? 1 : 20,
      prepare: false,
    };
    globalAuthDbState.__khasigptAuthPostgresClient = postgres(
      postgresUrl,
      poolConfig
    );
  }

  globalAuthDbState.__khasigptAuthDrizzleDb ??= drizzle(
    globalAuthDbState.__khasigptAuthPostgresClient
  );
  return globalAuthDbState.__khasigptAuthDrizzleDb;
}

function normalizeEmailValue(email: string) {
  return email.trim().toLowerCase();
}

function isValidUUID(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export async function getAuthUsersByEmail(
  email: string
): Promise<AuthDbUser[]> {
  try {
    const normalizedEmail = normalizeEmailValue(email);
    return await getAuthDb()
      .select(authUserColumns)
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizedEmail}`)
      .limit(1);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get auth user by email"
    );
  }
}

export async function getAuthUserById(
  id: string
): Promise<AuthDbUser | null> {
  if (!isValidUUID(id)) {
    return null;
  }

  try {
    const [record] = await getAuthDb()
      .select(authUserColumns)
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    return record ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get auth user by id"
    );
  }
}

export async function getAuthUserRoleById(
  id: string
): Promise<Pick<AuthDbUser, "id" | "isActive" | "role"> | null> {
  if (!isValidUUID(id)) {
    return null;
  }

  try {
    const [record] = await getAuthDb()
      .select({
        id: user.id,
        isActive: user.isActive,
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    return record ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get auth user role by id"
    );
  }
}
