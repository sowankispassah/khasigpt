import "server-only";

import { createHash } from "node:crypto";
import { compare } from "bcrypt-ts";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { creatorReferral, emailVerificationToken, mobileOAuthHandoffReceipt, passwordResetToken, type User, user } from "@/lib/db/schema";
import { generateHashedPassword } from "@/lib/db/utils";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

export type AuthDbUser = Pick<
  User,
  | "id"
  | "email"
  | "password"
  | "sessionVersion"
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
  sessionVersion: user.sessionVersion,
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
        usesPooler ? 1 : process.env.NODE_ENV === "development" ? 3 : 1
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

export async function consumeMobileOAuthHandoff({
  token, userId, sessionVersion, expiresAt,
}: { token: string; userId: string; sessionVersion: number; expiresAt: number }) {
  if (!isValidUUID(userId) || !Number.isSafeInteger(sessionVersion) || sessionVersion < 0 ||
    !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 660_000) return false;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  // One statement confirms current identity and wins the unique receipt. The
  // cleanup is bounded and skips locked rows; keep receipts for a further day
  // so clock skew or a delayed expiry cannot reopen a consumed token.
  const rows = await getAuthDb().execute(sql`
    WITH expired AS (
      SELECT "tokenHash" FROM ${mobileOAuthHandoffReceipt}
      WHERE "expiresAt" < now() - interval '1 day'
      ORDER BY "expiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED
    ), cleanup AS (
      DELETE FROM ${mobileOAuthHandoffReceipt} WHERE "tokenHash" IN (SELECT "tokenHash" FROM expired)
    )
    INSERT INTO ${mobileOAuthHandoffReceipt} ("tokenHash", "expiresAt")
    SELECT ${tokenHash}, ${new Date(expiresAt).toISOString()}::timestamptz FROM ${user}
    WHERE ${user.id} = ${userId} AND ${user.isActive} = true
      AND ${user.sessionVersion} = ${sessionVersion}
      AND ${new Date(expiresAt).toISOString()}::timestamptz > now()
    ON CONFLICT ("tokenHash") DO NOTHING RETURNING "tokenHash"
  `);
  return rows.length === 1;
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

const pendingUserReads = new Map<string, Promise<AuthDbUser | null>>();

export function getAuthUserById(id: string): Promise<AuthDbUser | null> {
  const pending = pendingUserReads.get(id);
  if (pending) return pending;
  // Coalesce the simultaneous requests made by one startup. This is not a
  // session cache: every subsequent read still confirms the current DB user.
  const read = loadAuthUserById(id).finally(() => {
    if (pendingUserReads.get(id) === read) pendingUserReads.delete(id);
  });
  pendingUserReads.set(id, read);
  return read;
}

async function loadAuthUserById(
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

// Profile completion is part of signup. It must not queue behind optional
// bootstrap, history, billing, or admin work on the general-purpose pool.
export async function updateAuthUserProfileFields({
  id,
  dateOfBirth,
  firstName,
  lastName,
}: {
  id: string;
  dateOfBirth?: string;
  firstName?: string;
  lastName?: string;
}) {
  if (!isValidUUID(id)) return null;
  const startedAt = Date.now();
  try {
    const [updated] = await getAuthDb()
      .update(user)
      .set({
        ...(dateOfBirth !== undefined ? { dateOfBirth } : {}),
        ...(firstName !== undefined ? { firstName: firstName.trim() } : {}),
        ...(lastName !== undefined ? { lastName: lastName.trim() } : {}),
        updatedAt: new Date(),
      })
      .where(and(
        eq(user.id, id),
        dateOfBirth !== undefined
          ? or(isNull(user.dateOfBirth), eq(user.dateOfBirth, dateOfBirth))
          : undefined
      ))
      .returning({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: user.dateOfBirth,
      });
    console.info("[auth.profile] Save completed.", {
      durationMs: Date.now() - startedAt,
      updated: Boolean(updated),
    });
    return updated ?? null;
  } catch (error) {
    const cause = error instanceof Error && error.cause ? error.cause : error;
    console.error("[auth.profile] Save failed.", {
      durationMs: Date.now() - startedAt,
      code: cause && typeof cause === "object" && "code" in cause
        ? String(cause.code) : "unknown",
    });
    throw new ChatSDKError("bad_request:database", "Failed to update profile");
  }
}

export async function getAuthUserRoleById(
  id: string
): Promise<Pick<AuthDbUser, "id" | "isActive" | "role" | "sessionVersion"> | null> {
  if (!isValidUUID(id)) {
    return null;
  }

  try {
    const [record] = await getAuthDb()
      .select({
        id: user.id,
        isActive: user.isActive,
        role: user.role,
        sessionVersion: user.sessionVersion,
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

// Compare and write against the same credential version. A concurrent reset or
// change wins once; the losing request cannot overwrite it with stale proof.
export async function changeAuthUserPassword({ id, currentPassword, password, sessionVersion }: {
  id: string; currentPassword: string; password: string; sessionVersion: number;
}): Promise<"success" | "current_invalid" | "reset_required" | "session_changed"> {
  const record = await getAuthUserById(id);
  if (!record?.isActive || record.sessionVersion !== sessionVersion) return "session_changed";
  if (!record.password) return "reset_required";
  if (!(await compare(currentPassword, record.password))) return "current_invalid";
  const hashedPassword = generateHashedPassword(password);
  return getAuthDb().transaction(async (tx) => {
    const [updated] = await tx.update(user).set({
      password: hashedPassword, sessionVersion: sql`${user.sessionVersion} + 1`, updatedAt: new Date(),
    }).where(and(eq(user.id, id), eq(user.isActive, true),
      eq(user.password, record.password!), eq(user.sessionVersion, sessionVersion))).returning({ id: user.id });
    if (!updated) return "session_changed";
    await tx.delete(passwordResetToken).where(eq(passwordResetToken.userId, id));
    return "success";
  });
}

export async function resetAuthUserPassword(token: string, password: string): Promise<boolean> {
  const hashedPassword = generateHashedPassword(password);
  return getAuthDb().transaction(async (tx) => {
    const [candidate] = await tx.select({ userId: passwordResetToken.userId }).from(passwordResetToken)
      .where(eq(passwordResetToken.token, token)).limit(1);
    if (!candidate) return false;
    // All credential writes lock the user before deleting recovery links.
    const [owner] = await tx.select({ id: user.id }).from(user)
      .where(eq(user.id, candidate.userId)).for("update").limit(1);
    if (!owner) return false;
    // Re-read after acquiring the user lock: a competing reset may have used it.
    const [proof] = await tx.select({ id: passwordResetToken.id }).from(passwordResetToken)
      .where(and(eq(passwordResetToken.token, token), eq(passwordResetToken.userId, owner.id),
        sql`${passwordResetToken.expiresAt} > now()`)).limit(1);
    if (!proof) return false;
    await tx.update(user).set({ password: hashedPassword,
      sessionVersion: sql`${user.sessionVersion} + 1`, updatedAt: new Date() }).where(eq(user.id, owner.id));
    await tx.delete(passwordResetToken).where(eq(passwordResetToken.userId, owner.id));
    return true;
  });
}

export async function createAuthGuestUser(): Promise<AuthDbUser> {
  const email = ["guest", Date.now(), generateUUID().slice(0, 8)].join("-");
  const password = generateHashedPassword(generateUUID());

  try {
    const [record] = await getAuthDb()
      .insert(user)
      .values({
        email,
        password,
        isActive: true,
        authProvider: "credentials",
        firstName: "Guest",
        lastName: "User",
        dateOfBirth: "1990-01-01",
      })
      .returning(authUserColumns);

    if (!record) {
      throw new Error("guest_user_not_created");
    }

    return record;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

// A signup still pending email verification never proved control of the
// mailbox, so whoever chose its password may not own the address. Google has
// now proved it: hand the account to the mailbox owner and drop the unproven
// password. Only a pending row matches, so accounts deactivated by an admin or
// the user stay rejected, and a concurrent link verification wins at most once.
async function claimPendingAuthUserForOAuth(
  id: string
): Promise<AuthDbUser | null> {
  try {
    return await getAuthDb().transaction(async (tx) => {
      const [claimed] = await tx.update(user).set({
        isActive: true, emailVerificationPending: false, password: null, authProvider: "google",
        sessionVersion: sql`${user.sessionVersion} + 1`, updatedAt: new Date(),
      }).where(and(eq(user.id, id), eq(user.emailVerificationPending, true)))
        .returning(authUserColumns);
      if (!claimed) {
        // A concurrent link verification may have activated it first.
        const [current] = await tx.select(authUserColumns).from(user)
          .where(eq(user.id, id)).limit(1);
        return current?.isActive ? current : null;
      }
      await tx.delete(emailVerificationToken).where(eq(emailVerificationToken.userId, id));
      return claimed;
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to claim pending OAuth user"
    );
  }
}

export async function ensureAuthOAuthUser(
  email: string,
  profile?: {
    signupReferralCode?: string | null;
    image?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }
): Promise<{ user: AuthDbUser; isNewUser: boolean }> {
  const normalizedEmail = normalizeEmailValue(email);
  const [found] = await getAuthUsersByEmail(normalizedEmail);

  if (found) {
    const existing = found.isActive
      ? found
      : await claimPendingAuthUserForOAuth(found.id);
    if (!existing) {
      throw new ChatSDKError("forbidden:auth", "account_inactive");
    }

    const firstName = profile?.firstName?.trim() || null;
    const lastName = profile?.lastName?.trim() || null;
    const image = profile?.image?.trim() || null;
    const updates: Partial<typeof user.$inferInsert> = {};

    if (firstName && firstName !== (existing.firstName ?? "")) {
      updates.firstName = firstName;
    }
    if (lastName && lastName !== (existing.lastName ?? "")) {
      updates.lastName = lastName;
    }
    if (image && !existing.image) {
      updates.image = image;
    }

    if (Object.keys(updates).length === 0) {
      return { user: existing, isNewUser: false };
    }

    void getAuthDb()
      .update(user)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(user.id, existing.id))
      .then(() => undefined)
      .catch((error) => {
        console.warn("[auth-db] Optional OAuth profile sync failed.", {
          userId: existing.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return { user: existing, isNewUser: false };
  }

  try {
    const [created] = await getAuthDb()
      .insert(user)
      .values({
        email: normalizedEmail,
        isActive: true,
        authProvider: "google",
        signupReferralCode: profile?.signupReferralCode ? sql`(select ${creatorReferral.code} from ${creatorReferral} where ${creatorReferral.code} = ${profile.signupReferralCode} and ${creatorReferral.isActive} = true limit 1 for key share)` : null,
        image: profile?.image?.trim() || null,
        firstName: profile?.firstName?.trim() || null,
        lastName: profile?.lastName?.trim() || null,
      })
      .onConflictDoNothing()
      .returning(authUserColumns);

    if (created) {
      return { user: created, isNewUser: true };
    }

    const [raceWinner] = await getAuthUsersByEmail(normalizedEmail);
    if (!raceWinner) {
      throw new Error("oauth_user_not_created");
    }
    const account = raceWinner.isActive
      ? raceWinner
      : await claimPendingAuthUserForOAuth(raceWinner.id);
    if (!account) {
      throw new ChatSDKError("forbidden:auth", "account_inactive");
    }

    return { user: account, isNewUser: false };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create OAuth user"
    );
  }
}
