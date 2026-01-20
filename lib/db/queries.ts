if (
  typeof process === "undefined" ||
  process.env.SKIP_TRANSLATION_CACHE !== "1"
) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  require("server-only");
}

import { randomBytes } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { unstable_cache } from "next/cache";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { normalizeCharacterText } from "@/lib/ai/character-normalize";
import { DEFAULT_FREE_MESSAGES_PER_DAY, TOKENS_PER_CREDIT } from "../constants";
import { ChatSDKError } from "../errors";
import {
  getFallbackUsdToInrRate,
  getUsdToInrRate,
} from "../services/exchange-rate";
import type { AppUsage } from "../usage";
import { generateUUID } from "../utils";
import {
  type AppSetting,
  type AuditLog,
  appSetting,
  auditLog,
  type Character,
  type CharacterAliasIndex,
  type CharacterRefImage,
  type Chat,
  type ContactMessage,
  type ContactMessageStatus,
  type Coupon,
  type CouponRewardPayout,
  character,
  characterAliasIndex,
  chat,
  contactMessage,
  coupon,
  couponRedemption,
  couponRewardPayout,
  type DBMessage,
  document,
  type EmailVerificationToken,
  emailVerificationToken,
  type ImageModelConfig,
  type ImpersonationToken,
  imageModelConfig,
  impersonationToken,
  type Language,
  language,
  type ModelConfig,
  message,
  modelConfig,
  type PasswordResetToken,
  type PaymentTransaction,
  type PricingPlan,
  passwordResetToken,
  paymentTransaction,
  pricingPlan,
  type Suggestion,
  stream,
  suggestion,
  type TokenUsage,
  type TranslationKey,
  type TranslationValue,
  tokenUsage,
  translationKey,
  translationValue,
  type User,
  type UserSubscription,
  user,
  userProfileImage,
  userSubscription,
  vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

try {
  setDefaultResultOrder("ipv4first");
} catch (_error) {
  // Older Node runtimes may not support setDefaultResultOrder; ignore.
}

export type DateRange = {
  start?: Date;
  end?: Date;
};

function normalizeEndOfDay(date: Date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function buildDateRangeConditions<T>(
  column: T,
  range?: DateRange
): SQL<boolean>[] {
  if (!range) {
    return [];
  }

  const conditions: SQL<boolean>[] = [];

  if (range.start) {
    conditions.push(gte(column as any, range.start) as SQL<boolean>);
  }

  if (range.end) {
    conditions.push(
      lte(column as any, normalizeEndOfDay(range.end)) as SQL<boolean>
    );
  }

  return conditions;
}

const SUBUNIT_DIVISORS: Record<string, number> = {
  INR: 100,
  USD: 100,
};

function convertSubunitAmount(amount: number, currency: string): number {
  const numericAmount =
    typeof amount === "number"
      ? amount
      : typeof amount === "string"
        ? Number.parseFloat(amount)
        : Number.NaN;

  if (!Number.isFinite(numericAmount)) {
    return 0;
  }

  const divisor = SUBUNIT_DIVISORS[currency?.toUpperCase() ?? ""] ?? 100;
  return numericAmount / divisor;
}

function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase();
}

function toInteger(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

function maskUserIdentifier(identifier: string | null | undefined): string {
  const raw = identifier?.trim() ?? "";
  const base = raw.includes("@")
    ? (raw.split("@")[0] ?? "")
    : raw.replace(/\s+/g, "");
  const source = base.replace(/\s+/g, "");
  if (!source) {
    return "User ****";
  }
  const visible = source.slice(0, 3) || source;
  const maskLength = Math.max(source.length - visible.length, 4);
  return `${visible}${"*".repeat(maskLength)}`;
}

function sanitizeAuditString(
  value: string | null | undefined,
  maxLength = 512
): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[\r\n]/g, " ").trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, maxLength);
}

function calculateRewardAmount(
  totalRevenueInPaise: number,
  rewardPercentage: number
) {
  if (!(Number.isFinite(totalRevenueInPaise) && totalRevenueInPaise > 0)) {
    return 0;
  }
  if (!(Number.isFinite(rewardPercentage) && rewardPercentage > 0)) {
    return 0;
  }
  const rawReward = (totalRevenueInPaise * rewardPercentage) / 100;
  let reward = Math.round(rawReward);
  if (reward <= 0 && rawReward > 0) {
    reward = 1;
  }
  return reward;
}

function createCouponStatsSubquery() {
  return db
    .select({
      couponId: couponRedemption.couponId,
      usageCount: sql<number>`COUNT(${couponRedemption.id})`.as("usageCount"),
      totalDiscount:
        sql<number>`COALESCE(SUM(${couponRedemption.discountAmount}), 0)`.as(
          "totalDiscount"
        ),
      totalRevenue:
        sql<number>`COALESCE(SUM(${couponRedemption.paymentAmount}), 0)`.as(
          "totalRevenue"
        ),
      lastRedemptionAt: sql<Date | null>`MAX(${couponRedemption.createdAt})`.as(
        "lastRedemptionAt"
      ),
    })
    .from(couponRedemption)
    .groupBy(couponRedemption.couponId)
    .as("coupon_stats");
}

function createCouponPayoutStatsSubquery() {
  return db
    .select({
      couponId: couponRewardPayout.couponId,
      totalPaid: sql<number>`COALESCE(SUM(${couponRewardPayout.amount}), 0)`.as(
        "totalPaid"
      ),
      payoutCount: sql<number>`COUNT(${couponRewardPayout.id})`.as(
        "payoutCount"
      ),
    })
    .from(couponRewardPayout)
    .groupBy(couponRewardPayout.couponId)
    .as("coupon_payout_stats");
}

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

const parseOr = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

type GlobalDbState = {
  postgresClient?: ReturnType<typeof postgres>;
  drizzleDb?: PostgresJsDatabase;
};

const globalDbState = globalThis as typeof globalThis & GlobalDbState;

const poolConfig = {
  max: parseOr(process.env.POSTGRES_POOL_SIZE, 3),
  idle_timeout: parseOr(process.env.POSTGRES_IDLE_TIMEOUT, 20),
  max_lifetime: parseOr(process.env.POSTGRES_MAX_LIFETIME, 60 * 30),
};

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
  throw new ChatSDKError(
    "bad_request:configuration",
    "POSTGRES_URL is not configured"
  );
}

const client =
  globalDbState.postgresClient ?? postgres(postgresUrl, poolConfig);

globalDbState.postgresClient ??= client;

export const db = globalDbState.drizzleDb ?? drizzle(client);

globalDbState.drizzleDb ??= db;

function normalizeEmailValue(email: string): string {
  return email.trim().toLowerCase();
}

const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;
const MANUAL_TOP_UP_PLAN_ID = "00000000-0000-0000-0000-0000000000ff";
const LANGUAGE_CODE_REGEX = /^[a-z0-9-]{2,16}$/;

const PAYMENT_STATUS_PENDING: PaymentTransaction["status"] = "pending";
const PAYMENT_STATUS_PROCESSING: PaymentTransaction["status"] = "processing";
const PAYMENT_STATUS_PAID: PaymentTransaction["status"] = "paid";
const PAYMENT_STATUS_FAILED: PaymentTransaction["status"] = "failed";

export type ChatListItem = Chat & { userEmail: string | null };

export async function getUser(email: string): Promise<User[]> {
  try {
    const normalizedEmail = normalizeEmailValue(email);
    return await db
      .select()
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .orderBy(asc(user.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function getUserById(id: string): Promise<User | null> {
  if (typeof id !== "string" || !isValidUUID(id)) {
    return null;
  }

  try {
    const [record] = await db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    return record ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get user by id");
  }
}

export async function createUser(
  email: string,
  password: string
): Promise<User> {
  const hashedPassword = generateHashedPassword(password);
  const normalizedEmail = normalizeEmailValue(email);

  try {
    const [created] = await db
      .insert(user)
      .values({
        email: normalizedEmail,
        password: hashedPassword,
        isActive: false,
        authProvider: "credentials",
      })
      .returning();

    return created;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create user");
  }
}

export async function createOAuthUser(
  email: string,
  image: string | null = null,
  firstName: string | null = null,
  lastName: string | null = null
): Promise<User> {
  const normalizedEmail = normalizeEmailValue(email);
  try {
    const [created] = await db
      .insert(user)
      .values({
        email: normalizedEmail,
        isActive: true,
        authProvider: "google",
        image,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
      })
      .returning();

    return created;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create OAuth user"
    );
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db
      .insert(user)
      .values({
        email,
        password,
        isActive: true,
        authProvider: "credentials",
      })
      .returning({
        id: user.id,
        email: user.email,
        role: user.role,
      });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function ensureOAuthUser(
  email: string,
  profile?: {
    image?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }
): Promise<{ user: User; isNewUser: boolean }> {
  const normalizedEmail = normalizeEmailValue(email);
  const [existing] = await getUser(normalizedEmail);

  if (existing) {
    if (!existing.isActive) {
      throw new ChatSDKError("forbidden:auth", "account_inactive");
    }

    if (existing.authProvider !== "google") {
      throw new ChatSDKError("forbidden:auth", "account_link_required");
    }

    let userRecord = existing;

    const activeProfileImage = await getActiveUserProfileImage({
      userId: userRecord.id,
    });

    if (!activeProfileImage?.imageUrl && profile?.image) {
      const updated = await setActiveUserProfileImage({
        userId: userRecord.id,
        imageUrl: profile.image,
        source: "google",
      });
      if (updated?.user) {
        userRecord = updated.user;
      }
    }

    const nameUpdates: Partial<typeof user.$inferInsert> = {};
    if (
      profile?.firstName &&
      profile.firstName.trim().length > 0 &&
      profile.firstName.trim() !== (userRecord.firstName ?? "")
    ) {
      nameUpdates.firstName = profile.firstName.trim();
    }

    if (
      profile?.lastName &&
      profile.lastName.trim().length > 0 &&
      profile.lastName.trim() !== (userRecord.lastName ?? "")
    ) {
      nameUpdates.lastName = profile.lastName.trim();
    }

    if (Object.keys(nameUpdates).length > 0) {
      const [updated] = await db
        .update(user)
        .set({
          ...nameUpdates,
          updatedAt: new Date(),
        })
        .where(eq(user.id, userRecord.id))
        .returning();
      userRecord = updated ?? userRecord;
    }

    return { user: userRecord, isNewUser: false };
  }

  const newUser = await createOAuthUser(
    normalizedEmail,
    profile?.image ?? null,
    profile?.firstName ?? null,
    profile?.lastName ?? null
  );

  return { user: newUser, isNewUser: true };
}

export async function deleteEmailVerificationTokensForUser({
  userId,
}: {
  userId: string;
}) {
  try {
    await db
      .delete(emailVerificationToken)
      .where(eq(emailVerificationToken.userId, userId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete email verification tokens"
    );
  }
}

export async function deletePasswordResetTokensForUser({
  userId,
}: {
  userId: string;
}) {
  try {
    await db
      .delete(passwordResetToken)
      .where(eq(passwordResetToken.userId, userId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete password reset tokens"
    );
  }
}

export async function deletePasswordResetTokenById({ id }: { id: string }) {
  try {
    await db.delete(passwordResetToken).where(eq(passwordResetToken.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete password reset token"
    );
  }
}

export async function createEmailVerificationTokenRecord({
  userId,
  token,
  expiresAt,
}: {
  userId: string;
  token: string;
  expiresAt: Date;
}): Promise<EmailVerificationToken> {
  try {
    const [created] = await db
      .insert(emailVerificationToken)
      .values({ userId, token, expiresAt })
      .returning();

    return created;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create email verification token"
    );
  }
}

export async function createPasswordResetTokenRecord({
  userId,
  token,
  expiresAt,
}: {
  userId: string;
  token: string;
  expiresAt: Date;
}): Promise<PasswordResetToken> {
  try {
    const [created] = await db
      .insert(passwordResetToken)
      .values({ userId, token, expiresAt })
      .returning();

    return created;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create password reset token"
    );
  }
}

export async function getEmailVerificationTokenRecord(
  tokenValue: string
): Promise<EmailVerificationToken | null> {
  try {
    const [record] = await db
      .select()
      .from(emailVerificationToken)
      .where(eq(emailVerificationToken.token, tokenValue))
      .limit(1);

    return record ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get email verification token"
    );
  }
}

export async function getPasswordResetTokenRecord(
  tokenValue: string
): Promise<PasswordResetToken | null> {
  try {
    const [record] = await db
      .select()
      .from(passwordResetToken)
      .where(eq(passwordResetToken.token, tokenValue))
      .limit(1);

    return record ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get password reset token"
    );
  }
}

export type VerifyEmailResult =
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "already_verified"; user: User }
  | { status: "verified"; user: User };

export async function verifyUserEmailByToken(
  tokenValue: string
): Promise<VerifyEmailResult> {
  try {
    const tokenRecord = await getEmailVerificationTokenRecord(tokenValue);

    if (!tokenRecord) {
      return { status: "not_found" };
    }

    const [matchingUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, tokenRecord.userId))
      .limit(1);

    if (!matchingUser) {
      await deleteEmailVerificationTokensForUser({
        userId: tokenRecord.userId,
      });
      return { status: "not_found" };
    }

    if (tokenRecord.expiresAt < new Date()) {
      await db
        .delete(emailVerificationToken)
        .where(eq(emailVerificationToken.id, tokenRecord.id));

      return { status: "expired" };
    }

    if (matchingUser.isActive) {
      await db
        .delete(emailVerificationToken)
        .where(eq(emailVerificationToken.id, tokenRecord.id));

      return { status: "already_verified", user: matchingUser };
    }

    const [updatedUser] = await db
      .update(user)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(user.id, matchingUser.id))
      .returning();

    await deleteEmailVerificationTokensForUser({ userId: matchingUser.id });

    return {
      status: "verified",
      user: updatedUser ?? matchingUser,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to verify user email"
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    const [updatedChat] = await db
      .update(chat)
      .set({ deletedAt: new Date() })
      .where(and(eq(chat.id, id), isNull(chat.deletedAt)))
      .returning();

    return updatedChat ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function restoreChatById({ id }: { id: string }) {
  try {
    const [restored] = await db
      .update(chat)
      .set({ deletedAt: null })
      .where(and(eq(chat.id, id), isNotNull(chat.deletedAt)))
      .returning();

    return restored ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to restore chat");
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const deletedChats = await db
      .update(chat)
      .set({ deletedAt: new Date() })
      .where(and(eq(chat.userId, userId), isNull(chat.deletedAt)))
      .returning({ id: chat.id });

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function hardDeleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [removed] = await db.delete(chat).where(eq(chat.id, id)).returning();
    return removed ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to hard delete chat"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const baseCondition = and(eq(chat.userId, id), isNull(chat.deletedAt));

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition ? and(whereCondition, baseCondition) : baseCondition
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(and(eq(chat.id, startingAfter), isNull(chat.deletedAt)))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(and(eq(chat.id, endingBefore), isNull(chat.deletedAt)))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({
  id,
  includeDeleted = false,
}: {
  id: string;
  includeDeleted?: boolean;
}) {
  if (!isValidUUID(id)) {
    return null;
  }

  try {
    const condition = includeDeleted
      ? eq(chat.id, id)
      : and(eq(chat.id, id), isNull(chat.deletedAt));

    const [selectedChat] = await db.select().from(chat).where(condition);
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    const cause =
      _error instanceof Error ? _error.message : "Failed to get chat by id";
    throw new ChatSDKError("bad_request:database", cause);
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    if (!messages.length) {
      return [];
    }

    // Ignore duplicates when the same message id is persisted twice (e.g. when
    // resuming a stream or retrying after a transient error).
    return await db.insert(message).values(messages).onConflictDoNothing();
  } catch (_error) {
    console.error("Failed to save messages", _error);
    const cause =
      _error instanceof Error ? _error.message : "Failed to save messages";
    throw new ChatSDKError("bad_request:database", cause);
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function getMessagesByChatIdPage({
  id,
  limit = 60,
  before,
}: {
  id: string;
  limit?: number;
  before?: Date | null;
}): Promise<{ messages: DBMessage[]; hasMore: boolean }> {
  const safeLimit = Math.max(1, Math.min(limit, 200));

  try {
    const conditions: SQL<boolean>[] = [
      eq(message.chatId, id) as SQL<boolean>,
    ];
    if (before instanceof Date && !Number.isNaN(before.getTime())) {
      conditions.push(lt(message.createdAt, before) as SQL<boolean>);
    }

    const rows = await db
      .select()
      .from(message)
      .where(and(...conditions))
      .orderBy(desc(message.createdAt))
      .limit(safeLimit + 1);

    const hasMore = rows.length > safeLimit;
    const trimmed = hasMore ? rows.slice(0, safeLimit) : rows;

    return { messages: trimmed.reverse(), hasMore };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load paged chat messages"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await db.update(chat).set({ title }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat title by id"
    );
  }
}

export async function updateChatLastContextById({
  chatId,
  context,
}: {
  chatId: string;
  // Store merged server-enriched usage object
  context: AppUsage;
}) {
  try {
    return await db
      .update(chat)
      .set({ lastContext: context })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.warn("Failed to update lastContext for chat", chatId, error);
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  since,
}: {
  id: string;
  since: Date;
}) {
  try {
    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, since),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

export async function updateUserEmail({
  id,
  email,
}: {
  id: string;
  email: string;
}) {
  const normalizedEmail = normalizeEmailValue(email);
  try {
    const [updated] = await db
      .update(user)
      .set({ email: normalizedEmail, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update user email"
    );
  }
}

export async function updateUserPassword({
  id,
  password,
}: {
  id: string;
  password: string;
}) {
  const hashedPassword = generateHashedPassword(password);

  try {
    const [updated] = await db
      .update(user)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update user password"
    );
  }
}

export async function updateUserLocation({
  id,
  latitude,
  longitude,
  accuracy,
  consent = true,
}: {
  id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  consent?: boolean;
}) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const acc = Number(accuracy);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ChatSDKError("bad_request:api", "Invalid coordinates");
  }

  try {
    const [updated] = await db
      .update(user)
      .set({
        locationLatitude: lat,
        locationLongitude: lng,
        locationAccuracy: Number.isFinite(acc) ? acc : null,
        locationConsent: Boolean(consent),
        locationUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update user location"
    );
  }
}

export async function updateUserProfile({
  id,
  dateOfBirth,
  firstName,
  lastName,
}: {
  id: string;
  dateOfBirth: string;
  firstName: string;
  lastName: string;
}) {
  try {
    const [updated] = await db
      .update(user)
      .set({
        dateOfBirth,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update profile");
  }
}

const IMPERSONATION_TOKEN_BYTES = 32;
const IMPERSONATION_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function createImpersonationToken({
  targetUserId,
  createdByAdminId,
}: {
  targetUserId: string;
  createdByAdminId: string;
}): Promise<ImpersonationToken> {
  const token = randomBytes(IMPERSONATION_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + IMPERSONATION_TOKEN_TTL_MS);

  try {
    const [record] = await db
      .insert(impersonationToken)
      .values({
        token,
        targetUserId,
        createdByAdminId,
        expiresAt,
      })
      .returning();

    return record;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create impersonation token"
    );
  }
}

export async function consumeImpersonationToken(
  token: string
): Promise<ImpersonationToken | null> {
  try {
    const [record] = await db
      .update(impersonationToken)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(impersonationToken.token, token),
          isNull(impersonationToken.usedAt),
          gt(impersonationToken.expiresAt, new Date())
        )
      )
      .returning();

    return record ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to consume impersonation token"
    );
  }
}

export async function updateUserName({
  id,
  firstName,
  lastName,
}: {
  id: string;
  firstName: string;
  lastName: string;
}) {
  try {
    const [updated] = await db
      .update(user)
      .set({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update name");
  }
}

export async function updateUserImage({
  id,
  image,
}: {
  id: string;
  image: string | null;
}) {
  if (!image) {
    await clearActiveUserProfileImage({ userId: id });
    return getUserById(id);
  }

  const result = await setActiveUserProfileImage({
    userId: id,
    imageUrl: image,
    source: "upload",
  });
  return result?.user ?? null;
}

export async function updateUserRole({
  id,
  role,
}: {
  id: string;
  role: User["role"];
}) {
  try {
    const [updated] = await db
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update user role"
    );
  }
}

export async function getActiveUserProfileImage({
  userId,
}: {
  userId: string;
}) {
  try {
    const [record] = await db
      .select()
      .from(userProfileImage)
      .where(
        and(
          eq(userProfileImage.userId, userId),
          eq(userProfileImage.isActive, true)
        )
      )
      .limit(1);

    return record ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load user profile image"
    );
  }
}

export async function setActiveUserProfileImage({
  userId,
  imageUrl,
  source,
}: {
  userId: string;
  imageUrl: string;
  source: string;
}) {
  const now = new Date();
  try {
    return await db.transaction(async (tx) => {
      await tx
        .update(userProfileImage)
        .set({ isActive: false })
        .where(eq(userProfileImage.userId, userId));

      const [record] = await tx
        .insert(userProfileImage)
        .values({
          userId,
          imageUrl,
          source,
          isActive: true,
        })
        .returning();

      const [updatedUser] = await tx
        .update(user)
        .set({
          image: imageUrl,
          updatedAt: now,
        })
        .where(eq(user.id, userId))
        .returning();

      return { record, user: updatedUser ?? null };
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to store profile image"
    );
  }
}

export async function clearActiveUserProfileImage({
  userId,
}: {
  userId: string;
}) {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(userProfileImage)
        .set({ isActive: false })
        .where(eq(userProfileImage.userId, userId));

      await tx
        .update(user)
        .set({ image: null, updatedAt: new Date() })
        .where(eq(user.id, userId));
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to clear profile image"
    );
  }
}

export async function updateUserPersonalKnowledgePermission({
  id,
  allowPersonalKnowledge,
}: {
  id: string;
  allowPersonalKnowledge: boolean;
}) {
  try {
    const [updated] = await db
      .update(user)
      .set({
        allowPersonalKnowledge,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update personal knowledge setting"
    );
  }
}

export async function updateUserActiveState({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  try {
    const [updated] = await db
      .update(user)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update user state"
    );
  }
}

export async function updateUserAuthProvider({
  id,
  authProvider,
}: {
  id: string;
  authProvider: User["authProvider"];
}) {
  const existing = await getUserById(id);
  if (!existing) {
    throw new ChatSDKError("bad_request:database", "User not found");
  }

  // Preserve the original signup provider; do not downgrade/override once set.
  if (existing.authProvider && existing.authProvider !== authProvider) {
    return existing;
  }

  try {
    const [updated] = await db
      .update(user)
      .set({ authProvider, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update user auth provider"
    );
  }
}

export async function listUsers({
  limit = 50,
  offset = 0,
}: {
  limit?: number;
  offset?: number;
} = {}): Promise<User[]> {
  try {
    return await db
      .select()
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError("bad_request:database", "Failed to list users");
  }
}

export async function listCreators(): Promise<User[]> {
  try {
    return await db
      .select()
      .from(user)
      .where(eq(user.role, "creator"))
      .orderBy(asc(user.firstName), asc(user.lastName));
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError("bad_request:database", "Failed to list creators");
  }
}

export async function getUserCount(): Promise<number> {
  try {
    const [result] = await db.select({ total: count(user.id) }).from(user);
    return Number(result?.total ?? 0);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to count users");
  }
}

export async function listChats({
  limit = 50,
  offset = 0,
  includeDeleted = false,
  onlyDeleted = false,
}: {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
} = {}): Promise<ChatListItem[]> {
  try {
    const conditions: SQL<boolean>[] = [];

    if (onlyDeleted) {
      conditions.push(isNotNull(chat.deletedAt) as SQL<boolean>);
    } else if (!includeDeleted) {
      conditions.push(isNull(chat.deletedAt) as SQL<boolean>);
    }

    const baseQuery = db
      .select({
        id: chat.id,
        createdAt: chat.createdAt,
        title: chat.title,
        userId: chat.userId,
        visibility: chat.visibility,
        lastContext: chat.lastContext,
        deletedAt: chat.deletedAt,
        userEmail: user.email,
      })
      .from(chat)
      .leftJoin(user, eq(chat.userId, user.id));

    const whereCondition =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : (and(...conditions) as SQL<boolean>);

    const query =
      whereCondition !== undefined
        ? baseQuery.where(whereCondition)
        : baseQuery;

    return await query
      .orderBy(desc(chat.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError("bad_request:database", "Failed to list chats");
  }
}

export async function getChatCount({
  includeDeleted = false,
  onlyDeleted = false,
}: {
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
} = {}): Promise<number> {
  try {
    const baseBuilder = db.select({ total: count(chat.id) }).from(chat);

    const filterCondition = onlyDeleted
      ? (isNotNull(chat.deletedAt) as SQL<boolean>)
      : includeDeleted
        ? undefined
        : (isNull(chat.deletedAt) as SQL<boolean>);

    const builder =
      filterCondition !== undefined
        ? baseBuilder.where(filterCondition)
        : baseBuilder;

    const [result] = await builder;
    return Number(result?.total ?? 0);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return 0;
    }
    throw new ChatSDKError("bad_request:database", "Failed to count chats");
  }
}

export const APP_SETTING_CACHE_TAG = "app-settings";

export function appSettingCacheTagForKey(key: string) {
  return `app-setting:${key}`;
}

function shouldUseAppSettingCache(key: string) {
  if (process.env.SKIP_APP_SETTING_CACHE === "1") {
    return false;
  }
  if (
    process.env.SKIP_TRANSLATION_CACHE === "1" &&
    key.startsWith("translation_bundle:")
  ) {
    return false;
  }
  return true;
}

async function getAppSettingsRaw(): Promise<AppSetting[]> {
  try {
    return await db.select().from(appSetting);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load application settings"
    );
  }
}

async function getAppSettingRaw<T>(key: string): Promise<T | null> {
  try {
    const [setting] = await db
      .select()
      .from(appSetting)
      .where(eq(appSetting.key, key))
      .limit(1);

    return setting ? (setting.value as T) : null;
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return null;
    }
    console.error("getAppSetting failed", _error);
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load application setting"
    );
  }
}

export async function getAppSettings(): Promise<AppSetting[]> {
  if (!shouldUseAppSettingCache("__all__")) {
    return getAppSettingsRaw();
  }

  const cached = unstable_cache(
    () => getAppSettingsRaw(),
    [APP_SETTING_CACHE_TAG],
    {
      tags: [APP_SETTING_CACHE_TAG],
    }
  );

  return cached();
}

export async function getAppSetting<T>(key: string): Promise<T | null> {
  if (!shouldUseAppSettingCache(key)) {
    return getAppSettingRaw(key);
  }

  const cached = unstable_cache(
    () => getAppSettingRaw<T>(key),
    [APP_SETTING_CACHE_TAG, key],
    {
      tags: [APP_SETTING_CACHE_TAG, appSettingCacheTagForKey(key)],
    }
  );

  return cached();
}

export async function setAppSetting<T>({
  key,
  value,
}: {
  key: string;
  value: T;
}) {
  const now = new Date();

  try {
    await db
      .insert(appSetting)
      .values({ key, value: value as unknown, updatedAt: now })
      .onConflictDoUpdate({
        target: appSetting.key,
        set: {
          value: value as unknown,
          updatedAt: now,
        },
      });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update application setting"
    );
  }
}

export async function deleteAppSetting(key: string) {
  try {
    await db.delete(appSetting).where(eq(appSetting.key, key));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete application setting"
    );
  }
}

export async function createAuditLogEntry({
  actorId,
  action,
  target,
  metadata,
  subjectUserId,
  ipAddress,
  userAgent,
  device,
}: {
  actorId: string;
  action: string;
  target: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  subjectUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  device?: string | null;
}): Promise<AuditLog | null> {
  const targetUserId =
    typeof target?.userId === "string" ? (target.userId as string) : null;
  const derivedSubjectUserId =
    (subjectUserId && isValidUUID(subjectUserId) ? subjectUserId : null) ??
    (targetUserId && isValidUUID(targetUserId) ? targetUserId : null);

  try {
    const [entry] = await db
      .insert(auditLog)
      .values({
        actorId,
        action,
        target,
        metadata: metadata ?? null,
        subjectUserId: derivedSubjectUserId,
        ipAddress: sanitizeAuditString(ipAddress, 128),
        userAgent: sanitizeAuditString(userAgent),
        device: sanitizeAuditString(device, 64),
      })
      .returning();

    return entry ?? null;
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return null;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create audit log entry"
    );
  }
}

export async function listAuditLog({
  limit = 50,
  offset = 0,
  userId,
}: {
  limit?: number;
  offset?: number;
  userId?: string | null;
} = {}): Promise<AuditLog[]> {
  try {
    const conditions: SQL<boolean>[] = [];
    if (userId && isValidUUID(userId)) {
      conditions.push(
        or(
          eq(auditLog.actorId, userId),
          eq(auditLog.subjectUserId, userId)
        ) as SQL<boolean>
      );
    }

    if (conditions.length > 0) {
      return await db
        .select()
        .from(auditLog)
        .where(and(...conditions))
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset);
    }

    return await db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list audit log entries"
    );
  }
}

export type CreateContactMessageInput = {
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  status?: ContactMessageStatus;
};

export async function createContactMessage(
  input: CreateContactMessageInput
): Promise<ContactMessage> {
  try {
    const normalizedEmail = normalizeEmailValue(input.email);
    const now = new Date();

    const [record] = await db
      .insert(contactMessage)
      .values({
        name: input.name,
        email: normalizedEmail,
        phone: input.phone ?? null,
        subject: input.subject,
        message: input.message,
        status: input.status ?? "new",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!record) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to store contact message"
      );
    }

    return record;
  } catch (error) {
    if (isTableMissingError(error)) {
      throw new ChatSDKError(
        "bad_request:database",
        "Contact messages table is missing. Run the latest migrations and try again."
      );
    }

    throw new ChatSDKError(
      "bad_request:database",
      "Failed to store contact message"
    );
  }
}

export async function listContactMessages({
  limit = 50,
  offset = 0,
  status,
}: {
  limit?: number;
  offset?: number;
  status?: ContactMessageStatus | "all";
} = {}): Promise<ContactMessage[]> {
  try {
    const baseQuery = db.select().from(contactMessage);
    const filteredQuery =
      status && status !== "all"
        ? baseQuery.where(eq(contactMessage.status, status))
        : baseQuery;

    const finalQuery = filteredQuery
      .orderBy(desc(contactMessage.createdAt))
      .limit(limit)
      .offset(offset);

    return await finalQuery;
  } catch (error) {
    if (isTableMissingError(error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list contact messages"
    );
  }
}

export async function getContactMessageCount({
  status,
}: {
  status?: ContactMessageStatus | "all";
} = {}): Promise<number> {
  try {
    const baseQuery = db.select({ value: count() }).from(contactMessage);
    const filteredQuery =
      status && status !== "all"
        ? baseQuery.where(eq(contactMessage.status, status))
        : baseQuery;

    const [result] = await filteredQuery;
    return result?.value ?? 0;
  } catch (error) {
    if (isTableMissingError(error)) {
      return 0;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to count contact messages"
    );
  }
}

export async function updateContactMessageStatus({
  id,
  status,
}: {
  id: string;
  status: ContactMessageStatus;
}): Promise<ContactMessage | null> {
  try {
    const now = new Date();
    const [updated] = await db
      .update(contactMessage)
      .set({
        status,
        updatedAt: now,
      })
      .where(eq(contactMessage.id, id))
      .returning();

    return updated ?? null;
  } catch (error) {
    if (isTableMissingError(error)) {
      return null;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update contact message status"
    );
  }
}

export type CreditHistoryEntry = {
  id: string;
  action: string;
  createdAt: Date;
  actorId: string;
  metadata: Record<string, unknown> | null;
  target: Record<string, unknown> | null;
};

export async function listUserCreditHistory({
  userId,
  limit = 10,
}: {
  userId: string;
  limit?: number;
}): Promise<CreditHistoryEntry[]> {
  try {
    const targetUserCondition: SQL<boolean> = sql`(${auditLog.target} ->> 'userId') = ${userId}`;

    const entries = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        createdAt: auditLog.createdAt,
        actorId: auditLog.actorId,
        metadata: auditLog.metadata,
        target: auditLog.target,
      })
      .from(auditLog)
      .where(
        or(
          and(
            eq(auditLog.action, "billing.manual_credit.grant"),
            targetUserCondition
          ),
          and(
            eq(auditLog.action, "billing.recharge"),
            eq(auditLog.actorId, userId)
          )
        )
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    return entries as CreditHistoryEntry[];
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load credit history"
    );
  }
}

export async function createModelConfig({
  key,
  provider,
  providerModelId,
  displayName,
  description = "",
  systemPrompt = null,
  codeTemplate = null,
  supportsReasoning = false,
  reasoningTag = null,
  config = null,
  isEnabled = true,
  isDefault = false,
  isMarginBaseline = false,
  freeMessagesPerDay = DEFAULT_FREE_MESSAGES_PER_DAY,
  inputProviderCostPerMillion = 0,
  outputProviderCostPerMillion = 0,
}: {
  key: string;
  provider: ModelConfig["provider"];
  providerModelId: string;
  displayName: string;
  description?: string;
  systemPrompt?: string | null;
  codeTemplate?: string | null;
  supportsReasoning?: boolean;
  reasoningTag?: string | null;
  config?: Record<string, unknown> | null;
  isEnabled?: boolean;
  isDefault?: boolean;
  isMarginBaseline?: boolean;
  freeMessagesPerDay?: number;
  inputProviderCostPerMillion?: number;
  outputProviderCostPerMillion?: number;
}): Promise<ModelConfig> {
  const now = new Date();

  try {
    const [created] = await db
      .insert(modelConfig)
      .values({
        key,
        provider,
        providerModelId,
        displayName,
        description,
        systemPrompt,
        codeTemplate,
        supportsReasoning,
        reasoningTag,
        config,
        isEnabled,
        isDefault,
        isMarginBaseline,
        freeMessagesPerDay,
        inputProviderCostPerMillion,
        outputProviderCostPerMillion,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .returning();

    if (!created) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to create model configuration"
      );
    }

    let result = created;

    if (isDefault) {
      await setDefaultModelConfig(created.id);
      result = { ...result, isDefault: true };
    }

    if (isMarginBaseline) {
      await setMarginBaselineModel(created.id);
      result = { ...result, isMarginBaseline: true };
    }

    return result;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create model configuration"
    );
  }
}

export async function getModelConfigById({
  id,
  includeDeleted = false,
}: {
  id: string;
  includeDeleted?: boolean;
}): Promise<ModelConfig | null> {
  try {
    const condition = includeDeleted
      ? eq(modelConfig.id, id)
      : and(eq(modelConfig.id, id), isNull(modelConfig.deletedAt));

    const [configResult] = await db
      .select()
      .from(modelConfig)
      .where(condition)
      .limit(1);

    return configResult ?? null;
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return null;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load model configuration"
    );
  }
}

export async function getModelConfigByKey({
  key,
  includeDeleted = false,
}: {
  key: string;
  includeDeleted?: boolean;
}): Promise<ModelConfig | null> {
  try {
    const condition = includeDeleted
      ? eq(modelConfig.key, key)
      : and(eq(modelConfig.key, key), isNull(modelConfig.deletedAt));

    const [configResult] = await db
      .select()
      .from(modelConfig)
      .where(condition)
      .limit(1);

    return configResult ?? null;
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return null;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load model configuration"
    );
  }
}

export async function listModelConfigs({
  includeDisabled = false,
  includeDeleted = false,
  onlyDeleted = false,
  limit = 100,
}: {
  includeDisabled?: boolean;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
  limit?: number;
} = {}): Promise<ModelConfig[]> {
  try {
    const baseBuilder = db.select().from(modelConfig);

    const deletedCondition = onlyDeleted
      ? (isNotNull(modelConfig.deletedAt) as SQL<boolean>)
      : includeDeleted
        ? undefined
        : (isNull(modelConfig.deletedAt) as SQL<boolean>);

    const enabledCondition = includeDisabled
      ? undefined
      : (eq(modelConfig.isEnabled, true) as SQL<boolean>);

    const whereCondition =
      deletedCondition && enabledCondition
        ? (and(deletedCondition, enabledCondition) as SQL<boolean>)
        : (deletedCondition ?? enabledCondition);

    const builder =
      whereCondition !== undefined
        ? baseBuilder.where(whereCondition)
        : baseBuilder;

    return await builder.orderBy(desc(modelConfig.createdAt)).limit(limit);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    console.error("listModelConfigs failed", _error);
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list model configurations"
    );
  }
}

export async function updateModelConfig({
  id,
  ...patch
}: {
  id: string;
  provider?: ModelConfig["provider"];
  providerModelId?: string;
  displayName?: string;
  description?: string | null;
  systemPrompt?: string | null;
  codeTemplate?: string | null;
  reasoningTag?: string | null;
  supportsReasoning?: boolean;
  config?: Record<string, unknown> | null;
  isEnabled?: boolean;
  inputProviderCostPerMillion?: number;
  outputProviderCostPerMillion?: number;
  freeMessagesPerDay?: number;
  isMarginBaseline?: boolean;
}): Promise<ModelConfig | null> {
  try {
    const updateData: Partial<typeof modelConfig.$inferInsert> = {};

    if (patch.provider !== undefined) {
      updateData.provider = patch.provider;
    }
    if (patch.providerModelId !== undefined) {
      updateData.providerModelId = patch.providerModelId;
    }
    if (patch.displayName !== undefined) {
      updateData.displayName = patch.displayName;
    }
    if (patch.description !== undefined) {
      updateData.description = patch.description ?? "";
    }
    if (patch.systemPrompt !== undefined) {
      updateData.systemPrompt = patch.systemPrompt ?? null;
    }
    if (patch.codeTemplate !== undefined) {
      updateData.codeTemplate = patch.codeTemplate ?? null;
    }
    if (patch.reasoningTag !== undefined) {
      updateData.reasoningTag = patch.reasoningTag ?? null;
    }
    if (patch.supportsReasoning !== undefined) {
      updateData.supportsReasoning = patch.supportsReasoning;
    }
    if (patch.config !== undefined) {
      updateData.config = patch.config ?? null;
    }
    if (patch.isEnabled !== undefined) {
      updateData.isEnabled = patch.isEnabled;
    }
    if (patch.inputProviderCostPerMillion !== undefined) {
      updateData.inputProviderCostPerMillion =
        patch.inputProviderCostPerMillion;
    }
    if (patch.outputProviderCostPerMillion !== undefined) {
      updateData.outputProviderCostPerMillion =
        patch.outputProviderCostPerMillion;
    }
    if (patch.freeMessagesPerDay !== undefined) {
      updateData.freeMessagesPerDay = patch.freeMessagesPerDay;
    }
    if (patch.isMarginBaseline !== undefined) {
      updateData.isMarginBaseline = patch.isMarginBaseline;
    }

    const [updated] = await db
      .update(modelConfig)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(and(eq(modelConfig.id, id), isNull(modelConfig.deletedAt)))
      .returning();

    if (!updated) {
      return null;
    }

    if (patch.isMarginBaseline) {
      await setMarginBaselineModel(id);
      return { ...updated, isMarginBaseline: true };
    }

    return updated;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update model configuration"
    );
  }
}

export async function deleteModelConfig(id: string) {
  try {
    await db
      .update(modelConfig)
      .set({
        deletedAt: new Date(),
        isDefault: false,
        isMarginBaseline: false,
        isEnabled: false,
      })
      .where(and(eq(modelConfig.id, id), isNull(modelConfig.deletedAt)));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete model configuration"
    );
  }
}

export async function hardDeleteModelConfig(id: string) {
  try {
    await db.delete(modelConfig).where(eq(modelConfig.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to hard delete model configuration"
    );
  }
}

export async function setDefaultModelConfig(id: string) {
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(modelConfig)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(eq(modelConfig.isDefault, true), isNull(modelConfig.deletedAt))
        );

      await tx
        .update(modelConfig)
        .set({ isDefault: true, updatedAt: now })
        .where(and(eq(modelConfig.id, id), isNull(modelConfig.deletedAt)));
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to set default model configuration"
    );
  }
}

export async function setMarginBaselineModel(id: string) {
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(modelConfig)
        .set({ isMarginBaseline: false, updatedAt: now })
        .where(
          and(
            eq(modelConfig.isMarginBaseline, true),
            isNull(modelConfig.deletedAt)
          )
        );

      await tx
        .update(modelConfig)
        .set({ isMarginBaseline: true, updatedAt: now })
        .where(and(eq(modelConfig.id, id), isNull(modelConfig.deletedAt)));
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to set margin baseline model"
    );
  }
}

export async function createImageModelConfig({
  key,
  provider,
  providerModelId,
  displayName,
  description = "",
  config = null,
  priceInPaise = 0,
  tokensPerImage = TOKENS_PER_CREDIT,
  isEnabled = true,
  isActive = false,
}: {
  key: string;
  provider: ImageModelConfig["provider"];
  providerModelId: string;
  displayName: string;
  description?: string;
  config?: Record<string, unknown> | null;
  priceInPaise?: number;
  tokensPerImage?: number;
  isEnabled?: boolean;
  isActive?: boolean;
}): Promise<ImageModelConfig> {
  const now = new Date();
  const resolvedTokensPerImage = Math.max(1, Math.round(tokensPerImage));
  const resolvedPriceInPaise = Math.max(0, Math.round(priceInPaise));

  try {
    const [created] = await db
      .insert(imageModelConfig)
      .values({
        key,
        provider,
        providerModelId,
        displayName,
        description,
        config,
        priceInPaise: resolvedPriceInPaise,
        tokensPerImage: resolvedTokensPerImage,
        isEnabled,
        isActive: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .returning();

    if (!created) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to create image model configuration"
      );
    }

    if (isActive) {
      await setActiveImageModelConfig(created.id);
      return { ...created, isActive: true };
    }

    return created;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create image model configuration"
    );
  }
}

export async function getImageModelConfigById({
  id,
  includeDeleted = false,
}: {
  id: string;
  includeDeleted?: boolean;
}): Promise<ImageModelConfig | null> {
  try {
    const condition = includeDeleted
      ? eq(imageModelConfig.id, id)
      : and(eq(imageModelConfig.id, id), isNull(imageModelConfig.deletedAt));

    const [configResult] = await db
      .select()
      .from(imageModelConfig)
      .where(condition)
      .limit(1);

    return configResult ?? null;
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return null;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load image model configuration"
    );
  }
}

export async function getImageModelConfigByKey({
  key,
  includeDeleted = false,
}: {
  key: string;
  includeDeleted?: boolean;
}): Promise<ImageModelConfig | null> {
  try {
    const condition = includeDeleted
      ? eq(imageModelConfig.key, key)
      : and(eq(imageModelConfig.key, key), isNull(imageModelConfig.deletedAt));

    const [configResult] = await db
      .select()
      .from(imageModelConfig)
      .where(condition)
      .limit(1);

    return configResult ?? null;
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return null;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load image model configuration"
    );
  }
}

export async function listImageModelConfigs({
  includeDisabled = false,
  includeDeleted = false,
  onlyDeleted = false,
  limit = 100,
}: {
  includeDisabled?: boolean;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
  limit?: number;
} = {}): Promise<ImageModelConfig[]> {
  try {
    const baseBuilder = db.select().from(imageModelConfig);

    const deletedCondition = onlyDeleted
      ? (isNotNull(imageModelConfig.deletedAt) as SQL<boolean>)
      : includeDeleted
        ? undefined
        : (isNull(imageModelConfig.deletedAt) as SQL<boolean>);

    const enabledCondition = includeDisabled
      ? undefined
      : (eq(imageModelConfig.isEnabled, true) as SQL<boolean>);

    const whereCondition =
      deletedCondition && enabledCondition
        ? (and(deletedCondition, enabledCondition) as SQL<boolean>)
        : (deletedCondition ?? enabledCondition);

    const builder =
      whereCondition !== undefined
        ? baseBuilder.where(whereCondition)
        : baseBuilder;

    return await builder.orderBy(desc(imageModelConfig.createdAt)).limit(limit);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    console.error("listImageModelConfigs failed", _error);
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list image model configurations"
    );
  }
}

export async function getActiveImageModelConfig(): Promise<ImageModelConfig | null> {
  try {
    const [activeModel] = await db
      .select()
      .from(imageModelConfig)
      .where(
        and(
          eq(imageModelConfig.isActive, true),
          eq(imageModelConfig.isEnabled, true),
          isNull(imageModelConfig.deletedAt)
        )
      )
      .limit(1);

    return activeModel ?? null;
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return null;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load active image model configuration"
    );
  }
}

export async function updateImageModelConfig({
  id,
  ...patch
}: {
  id: string;
  provider?: ImageModelConfig["provider"];
  providerModelId?: string;
  displayName?: string;
  description?: string | null;
  config?: Record<string, unknown> | null;
  priceInPaise?: number;
  tokensPerImage?: number;
  isEnabled?: boolean;
}): Promise<ImageModelConfig | null> {
  try {
    const updateData: Partial<typeof imageModelConfig.$inferInsert> = {};

    if (patch.provider !== undefined) {
      updateData.provider = patch.provider;
    }
    if (patch.providerModelId !== undefined) {
      updateData.providerModelId = patch.providerModelId;
    }
    if (patch.displayName !== undefined) {
      updateData.displayName = patch.displayName;
    }
    if (patch.description !== undefined) {
      updateData.description = patch.description ?? "";
    }
    if (patch.config !== undefined) {
      updateData.config = patch.config ?? null;
    }
    if (patch.priceInPaise !== undefined) {
      updateData.priceInPaise = Math.max(0, Math.round(patch.priceInPaise));
    }
    if (patch.tokensPerImage !== undefined) {
      updateData.tokensPerImage = Math.max(
        1,
        Math.round(patch.tokensPerImage)
      );
    }
    if (patch.isEnabled !== undefined) {
      updateData.isEnabled = patch.isEnabled;
    }

    const [updated] = await db
      .update(imageModelConfig)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(and(eq(imageModelConfig.id, id), isNull(imageModelConfig.deletedAt)))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update image model configuration"
    );
  }
}

export async function deleteImageModelConfig(id: string) {
  try {
    await db
      .update(imageModelConfig)
      .set({
        deletedAt: new Date(),
        isActive: false,
        isEnabled: false,
      })
      .where(and(eq(imageModelConfig.id, id), isNull(imageModelConfig.deletedAt)));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete image model configuration"
    );
  }
}

export async function hardDeleteImageModelConfig(id: string) {
  try {
    await db.delete(imageModelConfig).where(eq(imageModelConfig.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to hard delete image model configuration"
    );
  }
}

export async function setActiveImageModelConfig(id: string) {
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(imageModelConfig)
        .set({ isActive: false, updatedAt: now })
        .where(
          and(eq(imageModelConfig.isActive, true), isNull(imageModelConfig.deletedAt))
        );

      await tx
        .update(imageModelConfig)
        .set({ isActive: true, isEnabled: true, updatedAt: now })
        .where(and(eq(imageModelConfig.id, id), isNull(imageModelConfig.deletedAt)));
    });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to set active image model configuration"
    );
  }
}

function buildNormalizedAliases({
  canonicalName,
  aliases,
}: {
  canonicalName: string;
  aliases: string[];
}) {
  const normalized = new Set<string>();
  const candidates = [canonicalName, ...aliases];

  for (const value of candidates) {
    const normalizedValue = normalizeCharacterText(value);
    if (normalizedValue) {
      normalized.add(normalizedValue);
    }
  }

  return Array.from(normalized);
}

export async function listCharactersForAdmin({
  limit = 200,
}: {
  limit?: number;
} = {}): Promise<Character[]> {
  try {
    return await db
      .select()
      .from(character)
      .orderBy(desc(character.updatedAt))
      .limit(limit);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load characters"
    );
  }
}

export async function createCharacterWithAliases({
  canonicalName,
  aliases,
  refImages,
  lockedPrompt,
  negativePrompt,
  gender,
  height,
  weight,
  complexion,
  priority = 0,
  enabled = true,
}: {
  canonicalName: string;
  aliases: string[];
  refImages: CharacterRefImage[];
  lockedPrompt?: string | null;
  negativePrompt?: string | null;
  gender?: string | null;
  height?: string | null;
  weight?: string | null;
  complexion?: string | null;
  priority?: number;
  enabled?: boolean;
}): Promise<Character> {
  const now = new Date();
  const aliasIndex = buildNormalizedAliases({ canonicalName, aliases });

  try {
    return await db.transaction(async (tx) => {
      if (aliasIndex.length > 0) {
        const conflicts = await tx
          .select({
            aliasNormalized: characterAliasIndex.aliasNormalized,
          })
          .from(characterAliasIndex)
          .where(inArray(characterAliasIndex.aliasNormalized, aliasIndex))
          .limit(1);

        if (conflicts.length > 0) {
          throw new ChatSDKError(
            "bad_request:database",
            "One or more aliases are already assigned to another character."
          );
        }
      }

      const [created] = await tx
        .insert(character)
        .values({
          canonicalName,
          aliases,
          refImages,
          lockedPrompt: lockedPrompt ?? null,
          negativePrompt: negativePrompt ?? null,
          gender: gender ?? null,
          height: height ?? null,
          weight: weight ?? null,
          complexion: complexion ?? null,
          priority,
          enabled,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!created) {
        throw new ChatSDKError(
          "bad_request:database",
          "Failed to create character"
        );
      }

      if (aliasIndex.length > 0) {
        await tx.insert(characterAliasIndex).values(
          aliasIndex.map((aliasNormalized) => ({
            aliasNormalized,
            characterId: created.id,
            createdAt: now,
            updatedAt: now,
          }))
        );
      }

      return created;
    });
  } catch (_error) {
    if (_error instanceof ChatSDKError) {
      throw _error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to create character");
  }
}

export async function updateCharacterWithAliases({
  id,
  canonicalName,
  aliases,
  refImages,
  lockedPrompt,
  negativePrompt,
  gender,
  height,
  weight,
  complexion,
  priority,
  enabled,
}: {
  id: string;
  canonicalName: string;
  aliases: string[];
  refImages: CharacterRefImage[];
  lockedPrompt?: string | null;
  negativePrompt?: string | null;
  gender?: string | null;
  height?: string | null;
  weight?: string | null;
  complexion?: string | null;
  priority?: number;
  enabled?: boolean;
}): Promise<Character | null> {
  const now = new Date();
  const aliasIndex = buildNormalizedAliases({ canonicalName, aliases });

  try {
    return await db.transaction(async (tx) => {
      if (aliasIndex.length > 0) {
        const conflicts = await tx
          .select({
            aliasNormalized: characterAliasIndex.aliasNormalized,
          })
          .from(characterAliasIndex)
          .where(
            and(
              inArray(characterAliasIndex.aliasNormalized, aliasIndex),
              ne(characterAliasIndex.characterId, id)
            )
          )
          .limit(1);

        if (conflicts.length > 0) {
          throw new ChatSDKError(
            "bad_request:database",
            "One or more aliases are already assigned to another character."
          );
        }
      }

      const [updated] = await tx
        .update(character)
        .set({
          canonicalName,
          aliases,
          refImages,
          lockedPrompt: lockedPrompt ?? null,
          negativePrompt: negativePrompt ?? null,
          gender: gender ?? null,
          height: height ?? null,
          weight: weight ?? null,
          complexion: complexion ?? null,
          priority: priority ?? 0,
          enabled: enabled ?? true,
          updatedAt: now,
        })
        .where(eq(character.id, id))
        .returning();

      if (!updated) {
        return null;
      }

      await tx
        .delete(characterAliasIndex)
        .where(eq(characterAliasIndex.characterId, id));

      if (aliasIndex.length > 0) {
        await tx.insert(characterAliasIndex).values(
          aliasIndex.map((aliasNormalized) => ({
            aliasNormalized,
            characterId: id,
            createdAt: now,
            updatedAt: now,
          }))
        );
      }

      return updated;
    });
  } catch (_error) {
    if (_error instanceof ChatSDKError) {
      throw _error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to update character");
  }
}

export async function deleteCharacterById(id: string) {
  try {
    await db.delete(character).where(eq(character.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete character"
    );
  }
}

export async function listCharacterAliasIndex(): Promise<
  Pick<CharacterAliasIndex, "aliasNormalized" | "characterId">[]
> {
  try {
    return await db
      .select({
        aliasNormalized: characterAliasIndex.aliasNormalized,
        characterId: characterAliasIndex.characterId,
      })
      .from(characterAliasIndex);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load character alias index"
    );
  }
}

export async function getCharacterMatchCandidates(
  ids: string[]
): Promise<
  Array<
    Pick<Character, "id" | "priority" | "enabled"> & {
      refImages: CharacterRefImage[];
    }
  >
> {
  if (!ids.length) {
    return [];
  }

  try {
    return await db
      .select({
        id: character.id,
        priority: character.priority,
        enabled: character.enabled,
        refImages: character.refImages,
      })
      .from(character)
      .where(inArray(character.id, ids));
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load character match candidates"
    );
  }
}

export async function getCharacterForImageGeneration(
  id: string
): Promise<{
  id: string;
  canonicalName: string;
  refImages: CharacterRefImage[];
  lockedPrompt: string | null;
  negativePrompt: string | null;
  gender: string | null;
  height: string | null;
  weight: string | null;
  complexion: string | null;
  enabled: boolean;
  priority: number;
} | null> {
  try {
    const [row] = await db
      .select({
        id: character.id,
        canonicalName: character.canonicalName,
        refImages: character.refImages,
        lockedPrompt: character.lockedPrompt,
        negativePrompt: character.negativePrompt,
        gender: character.gender,
        height: character.height,
        weight: character.weight,
        complexion: character.complexion,
        enabled: character.enabled,
        priority: character.priority,
      })
      .from(character)
      .where(eq(character.id, id))
      .limit(1);

    return row ?? null;
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return null;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load character profile"
    );
  }
}

export async function listPricingPlans({
  includeInactive = false,
  includeDeleted = false,
  onlyDeleted = false,
  limit = 100,
}: {
  includeInactive?: boolean;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
  limit?: number;
} = {}): Promise<PricingPlan[]> {
  try {
    const baseBuilder = db.select().from(pricingPlan);

    const filters: SQL<boolean>[] = [];

    if (onlyDeleted) {
      filters.push(isNotNull(pricingPlan.deletedAt) as SQL<boolean>);
    } else if (!includeDeleted) {
      filters.push(isNull(pricingPlan.deletedAt) as SQL<boolean>);
    }

    if (!includeInactive) {
      filters.push(eq(pricingPlan.isActive, true) as SQL<boolean>);
    }

    const whereCondition =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : (and(...filters) as SQL<boolean>);

    const builder =
      whereCondition !== undefined
        ? baseBuilder.where(whereCondition)
        : baseBuilder;

    return await builder.orderBy(desc(pricingPlan.createdAt)).limit(limit);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list pricing plans"
    );
  }
}

export async function getPricingPlanById({
  id,
  includeDeleted = false,
}: {
  id: string;
  includeDeleted?: boolean;
}): Promise<PricingPlan | null> {
  try {
    const [plan] = await db
      .select()
      .from(pricingPlan)
      .where(
        includeDeleted
          ? eq(pricingPlan.id, id)
          : and(eq(pricingPlan.id, id), isNull(pricingPlan.deletedAt))
      )
      .limit(1);

    return plan ?? null;
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return null;
    }

    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load pricing plan"
    );
  }
}

export async function createPricingPlan({
  name,
  description = "",
  priceInPaise,
  tokenAllowance,
  billingCycleDays,
  isActive = true,
}: {
  name: string;
  description?: string | null;
  priceInPaise: number;
  tokenAllowance: number;
  billingCycleDays: number;
  isActive?: boolean;
}): Promise<PricingPlan> {
  const now = new Date();

  try {
    const [plan] = await db
      .insert(pricingPlan)
      .values({
        name,
        description,
        priceInPaise,
        tokenAllowance,
        billingCycleDays,
        isActive,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .returning();

    if (!plan) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to create pricing plan"
      );
    }

    return plan;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create pricing plan"
    );
  }
}

export async function updatePricingPlan({
  id,
  updates,
}: {
  id: string;
  updates: {
    name?: string;
    description?: string | null;
    priceInPaise?: number;
    tokenAllowance?: number;
    billingCycleDays?: number;
    isActive?: boolean;
  };
}): Promise<PricingPlan | null> {
  try {
    const [plan] = await db
      .update(pricingPlan)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(pricingPlan.id, id), isNull(pricingPlan.deletedAt)))
      .returning();

    return plan ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update pricing plan"
    );
  }
}

export async function deletePricingPlan(id: string) {
  try {
    await db
      .update(pricingPlan)
      .set({ deletedAt: new Date(), isActive: false })
      .where(and(eq(pricingPlan.id, id), isNull(pricingPlan.deletedAt)));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete pricing plan"
    );
  }
}

export async function hardDeletePricingPlan(id: string) {
  try {
    await db.delete(pricingPlan).where(eq(pricingPlan.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to hard delete pricing plan"
    );
  }
}

export type CouponWithStats = {
  id: string;
  code: string;
  discountPercentage: number;
  creatorRewardPercentage: number;
  creatorRewardStatus: string;
  creatorId: string;
  creatorName: string | null;
  creatorEmail: string | null;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  totalRevenueInPaise: number;
  totalDiscountInPaise: number;
  lastRedemptionAt: Date | null;
  estimatedRewardInPaise: number;
  totalPaidInPaise: number;
};

function fetchCouponStats(includePayouts: boolean): Promise<any[]> {
  const stats = createCouponStatsSubquery();
  const payoutStats = includePayouts ? createCouponPayoutStatsSubquery() : null;

  let query = db
    .select({
      id: coupon.id,
      code: coupon.code,
      discountPercentage: coupon.discountPercentage,
      creatorRewardPercentage: coupon.creatorRewardPercentage,
      creatorRewardStatus: coupon.creatorRewardStatus,
      creatorId: coupon.creatorId,
      validFrom: coupon.validFrom,
      validTo: coupon.validTo,
      isActive: coupon.isActive,
      description: coupon.description,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
      creatorFirstName: user.firstName,
      creatorLastName: user.lastName,
      creatorEmail: user.email,
      usageCount: sql<number>`COALESCE(${stats.usageCount}, 0)`,
      totalRevenueInPaise: sql<number>`COALESCE(${stats.totalRevenue}, 0)`,
      totalDiscountInPaise: sql<number>`COALESCE(${stats.totalDiscount}, 0)`,
      lastRedemptionAt: stats.lastRedemptionAt,
      totalPaidInPaise: includePayouts
        ? sql<number>`COALESCE(${payoutStats?.totalPaid}, 0)`
        : sql<number>`0`,
    })
    .from(coupon)
    .leftJoin(user, eq(coupon.creatorId, user.id))
    .leftJoin(stats, eq(stats.couponId, coupon.id))
    .orderBy(desc(coupon.createdAt));

  if (includePayouts && payoutStats) {
    query = query.leftJoin(payoutStats, eq(payoutStats.couponId, coupon.id));
  }

  return query;
}

export async function listCouponsWithStats(): Promise<CouponWithStats[]> {
  try {
    const rows = await fetchCouponStats(true);

    return rows.map((row) => {
      const computedName = [row.creatorFirstName, row.creatorLastName]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" ");

      const totalRevenueInPaise = toInteger(row.totalRevenueInPaise);
      const totalDiscountInPaise = toInteger(row.totalDiscountInPaise);
      const grossRevenue = totalRevenueInPaise + totalDiscountInPaise;
      const estimatedRewardInPaise = calculateRewardAmount(
        grossRevenue,
        row.creatorRewardPercentage ?? 0
      );
      const lastRedemptionAt = toDate(row.lastRedemptionAt);
      const totalPaidInPaise = toInteger(row.totalPaidInPaise);

      return {
        id: row.id,
        code: row.code,
        discountPercentage: row.discountPercentage,
        creatorRewardPercentage: row.creatorRewardPercentage ?? 0,
        creatorRewardStatus: row.creatorRewardStatus ?? "pending",
        creatorId: row.creatorId,
        validFrom: row.validFrom,
        validTo: row.validTo,
        isActive: row.isActive,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        creatorName: computedName || row.creatorEmail || null,
        creatorEmail: row.creatorEmail,
        usageCount: row.usageCount ?? 0,
        totalRevenueInPaise,
        totalDiscountInPaise,
        lastRedemptionAt,
        estimatedRewardInPaise,
        totalPaidInPaise,
      };
    });
  } catch (error) {
    if (isTableMissingError(error)) {
      const rows = await fetchCouponStats(false);
      return rows.map((row) => {
        const computedName = [row.creatorFirstName, row.creatorLastName]
          .filter((value): value is string => Boolean(value?.trim()))
          .join(" ");

        const totalRevenueInPaise = toInteger(row.totalRevenueInPaise);
        const totalDiscountInPaise = toInteger(row.totalDiscountInPaise);
        const grossRevenue = totalRevenueInPaise + totalDiscountInPaise;
        const estimatedRewardInPaise = calculateRewardAmount(
          grossRevenue,
          row.creatorRewardPercentage ?? 0
        );
        const lastRedemptionAt = toDate(row.lastRedemptionAt);

        return {
          id: row.id,
          code: row.code,
          discountPercentage: row.discountPercentage,
          creatorRewardPercentage: row.creatorRewardPercentage ?? 0,
          creatorRewardStatus: row.creatorRewardStatus ?? "pending",
          creatorId: row.creatorId,
          validFrom: row.validFrom,
          validTo: row.validTo,
          isActive: row.isActive,
          description: row.description,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          creatorName: computedName || row.creatorEmail || null,
          creatorEmail: row.creatorEmail,
          usageCount: row.usageCount ?? 0,
          totalRevenueInPaise,
          totalDiscountInPaise,
          lastRedemptionAt,
          estimatedRewardInPaise,
          totalPaidInPaise: 0,
        };
      });
    }
    console.error("listCouponsWithStats failed", error);
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load coupon analytics"
    );
  }
}

export async function getCouponById(id: string): Promise<Coupon | null> {
  try {
    const [record] = await db
      .select()
      .from(coupon)
      .where(eq(coupon.id, id))
      .limit(1);

    return record ?? null;
  } catch (error) {
    if (isTableMissingError(error)) {
      return null;
    }
    throw new ChatSDKError("bad_request:database", "Failed to load coupon");
  }
}

export async function getCouponByCode(code: string): Promise<Coupon | null> {
  const normalized = normalizeCouponCode(code);
  if (!normalized) {
    return null;
  }

  try {
    const [record] = await db
      .select()
      .from(coupon)
      .where(eq(coupon.code, normalized))
      .limit(1);
    return record ?? null;
  } catch (error) {
    if (isTableMissingError(error)) {
      return null;
    }
    throw new ChatSDKError("bad_request:database", "Failed to lookup coupon");
  }
}

export async function upsertCoupon({
  id,
  code,
  discountPercentage,
  creatorRewardPercentage,
  creatorId,
  validFrom,
  validTo,
  description,
  isActive = true,
}: {
  id?: string | null;
  code: string;
  discountPercentage: number;
  creatorRewardPercentage?: number;
  creatorId: string;
  validFrom: Date;
  validTo: Date | null;
  description?: string | null;
  isActive?: boolean;
}): Promise<Coupon> {
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCode) {
    throw new ChatSDKError("bad_request:coupon", "Coupon code is required");
  }
  const percentage = Math.min(Math.max(Math.round(discountPercentage), 1), 95);
  const rewardPercentage = Math.min(
    Math.max(Math.round(creatorRewardPercentage ?? 0), 0),
    95
  );
  const now = new Date();

  try {
    if (id) {
      const [updated] = await db
        .update(coupon)
        .set({
          code: normalizedCode,
          discountPercentage: percentage,
          creatorRewardPercentage: rewardPercentage,
          creatorId,
          validFrom,
          validTo: validTo ?? null,
          description: description ?? null,
          isActive,
          updatedAt: now,
        })
        .where(eq(coupon.id, id))
        .returning();

      if (!updated) {
        throw new ChatSDKError("not_found:coupon", "Coupon not found");
      }

      return updated;
    }

    const [created] = await db
      .insert(coupon)
      .values({
        code: normalizedCode,
        discountPercentage: percentage,
        creatorRewardPercentage: rewardPercentage,
        creatorId,
        validFrom,
        validTo: validTo ?? null,
        description: description ?? null,
        isActive,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!created) {
      throw new ChatSDKError("bad_request:database", "Failed to create coupon");
    }

    return created;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to save coupon");
  }
}

export async function setCouponStatus({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}): Promise<void> {
  try {
    await db
      .update(coupon)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(coupon.id, id));
  } catch (error) {
    if (isTableMissingError(error)) {
      return;
    }
    throw new ChatSDKError("bad_request:database", "Failed to update coupon");
  }
}

const VALID_REWARD_STATUSES = new Set(["pending", "paid"]);
const MAX_CREATOR_REDEMPTIONS_PAGE_SIZE = 50;

export async function setCouponRewardStatus({
  id,
  rewardStatus,
}: {
  id: string;
  rewardStatus: "pending" | "paid";
}): Promise<void> {
  if (!VALID_REWARD_STATUSES.has(rewardStatus)) {
    throw new ChatSDKError("bad_request:coupon", "Invalid reward status");
  }

  try {
    await db
      .update(coupon)
      .set({
        creatorRewardStatus: rewardStatus,
        updatedAt: new Date(),
      })
      .where(eq(coupon.id, id));
  } catch (error) {
    if (isTableMissingError(error)) {
      return;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update reward status"
    );
  }
}

export async function recordCouponRedemptionFromTransaction(
  transaction: PaymentTransaction
): Promise<void> {
  if (!transaction.couponId) {
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: couponRedemption.id })
        .from(couponRedemption)
        .where(eq(couponRedemption.orderId, transaction.orderId))
        .limit(1);

      if (existing) {
        return;
      }

      const [couponRecord] = await tx
        .select({
          id: coupon.id,
          creatorId: coupon.creatorId,
        })
        .from(coupon)
        .where(eq(coupon.id, transaction.couponId as string))
        .limit(1);

      if (!couponRecord) {
        return;
      }

      await tx.insert(couponRedemption).values({
        couponId: couponRecord.id,
        userId: transaction.userId,
        creatorId: couponRecord.creatorId,
        planId: transaction.planId,
        orderId: transaction.orderId,
        paymentAmount: transaction.amount,
        discountAmount: Math.max(0, transaction.discountAmount ?? 0),
      });
    });
  } catch (error) {
    if (isTableMissingError(error)) {
      return;
    }
    console.error("Failed to record coupon redemption", error);
  }
}

export async function recordCouponRewardPayout({
  couponId,
  amountInPaise,
  note,
  recordedBy,
}: {
  couponId: string;
  amountInPaise: number;
  note?: string | null;
  recordedBy: string;
}): Promise<CouponRewardPayout> {
  if (!couponId) {
    throw new ChatSDKError("bad_request:coupon", "Coupon id is required");
  }
  if (!(Number.isFinite(amountInPaise) && amountInPaise > 0)) {
    throw new ChatSDKError(
      "bad_request:coupon",
      "Payout amount must be greater than zero"
    );
  }

  try {
    const [existingCoupon] = await db
      .select({ id: coupon.id })
      .from(coupon)
      .where(eq(coupon.id, couponId))
      .limit(1);

    if (!existingCoupon) {
      throw new ChatSDKError("not_found:coupon", "Coupon not found");
    }

    const [payout] = await db
      .insert(couponRewardPayout)
      .values({
        couponId,
        amount: Math.round(amountInPaise),
        note: note ?? null,
        recordedBy,
      })
      .returning();

    if (!payout) {
      throw new ChatSDKError("bad_request:database", "Failed to record payout");
    }

    return payout;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError("bad_request:database", "Failed to record payout");
  }
}

export async function listCouponRewardPayouts(
  couponId: string,
  limit = 20
): Promise<CouponRewardPayout[]> {
  if (!couponId) {
    return [];
  }

  try {
    return await db
      .select()
      .from(couponRewardPayout)
      .where(eq(couponRewardPayout.couponId, couponId))
      .orderBy(desc(couponRewardPayout.createdAt))
      .limit(Math.max(1, Math.min(limit, 100)));
  } catch (error) {
    if (isTableMissingError(error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load payout history"
    );
  }
}

export type CreatorCouponSummary = {
  creator: {
    id: string;
    name: string | null;
    email: string | null;
  };
  coupons: Array<{
    id: string;
    code: string;
    discountPercentage: number;
    creatorRewardPercentage: number;
    creatorRewardStatus: string;
    validFrom: Date;
    validTo: Date | null;
    isActive: boolean;
    usageCount: number;
    totalRevenueInPaise: number;
    totalDiscountInPaise: number;
    lastRedemptionAt: Date | null;
    estimatedRewardInPaise: number;
    paidRewardInPaise: number;
    remainingRewardInPaise: number;
  }>;
  totals: {
    usageCount: number;
    totalRevenueInPaise: number;
    totalDiscountInPaise: number;
    totalRewardInPaise: number;
    pendingRewardInPaise: number;
    totalPaidInPaise: number;
    remainingRewardInPaise: number;
  };
};

export type CouponRedemptionDetail = {
  id: string;
  couponId: string;
  couponCode: string;
  userLabel: string;
  paymentAmountInPaise: number;
  discountAmountInPaise: number;
  rewardInPaise: number;
  createdAt: Date;
};

export type CreatorCouponRedemption = {
  id: string;
  couponId: string;
  couponCode: string;
  orderId: string;
  userLabel: string;
  paymentAmountInPaise: number;
  discountAmountInPaise: number;
  rewardInPaise: number;
  createdAt: Date;
};

export type CreatorRedemptionSortField = "date" | "payment";

export type CreatorCouponRedemptionsResult = {
  redemptions: CreatorCouponRedemption[];
  totalCount: number;
  page: number;
  pageSize: number;
  sortBy: CreatorRedemptionSortField;
  sortDirection: "asc" | "desc";
};

export async function getCreatorCouponSummary(
  creatorId: string
): Promise<CreatorCouponSummary | null> {
  try {
    const [creatorRecord] = await db
      .select({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      })
      .from(user)
      .where(eq(user.id, creatorId))
      .limit(1);

    if (!creatorRecord) {
      return null;
    }

    const stats = createCouponStatsSubquery();
    const payoutStats = createCouponPayoutStatsSubquery();
    const couponRows = await db
      .select({
        id: coupon.id,
        code: coupon.code,
        discountPercentage: coupon.discountPercentage,
        creatorRewardPercentage: coupon.creatorRewardPercentage,
        creatorRewardStatus: coupon.creatorRewardStatus,
        validFrom: coupon.validFrom,
        validTo: coupon.validTo,
        isActive: coupon.isActive,
        usageCount: sql<number>`COALESCE(${stats.usageCount}, 0)`,
        totalRevenueInPaise: sql<number>`COALESCE(${stats.totalRevenue}, 0)`,
        totalDiscountInPaise: sql<number>`COALESCE(${stats.totalDiscount}, 0)`,
        lastRedemptionAt: stats.lastRedemptionAt,
        totalPaidInPaise: sql<number>`COALESCE(${payoutStats.totalPaid}, 0)`,
      })
      .from(coupon)
      .leftJoin(stats, eq(stats.couponId, coupon.id))
      .leftJoin(payoutStats, eq(payoutStats.couponId, coupon.id))
      .where(eq(coupon.creatorId, creatorId))
      .orderBy(desc(coupon.createdAt));

    const coupons = couponRows.map((row) => {
      const usageCount = toInteger(row.usageCount);
      const totalRevenueInPaise = toInteger(row.totalRevenueInPaise);
      const totalDiscountInPaise = toInteger(row.totalDiscountInPaise);
      const grossRevenue = totalRevenueInPaise + totalDiscountInPaise;
      const rewardInPaise = calculateRewardAmount(
        grossRevenue,
        row.creatorRewardPercentage ?? 0
      );
      const lastRedemptionAt = toDate(row.lastRedemptionAt);
      const paidRewardInPaise = toInteger(row.totalPaidInPaise);
      const remainingRewardInPaise = Math.max(
        rewardInPaise - paidRewardInPaise,
        0
      );
      return {
        id: row.id,
        code: row.code,
        discountPercentage: row.discountPercentage,
        creatorRewardPercentage: row.creatorRewardPercentage ?? 0,
        creatorRewardStatus: row.creatorRewardStatus ?? "pending",
        validFrom: row.validFrom,
        validTo: row.validTo,
        isActive: row.isActive,
        usageCount,
        totalRevenueInPaise,
        totalDiscountInPaise,
        lastRedemptionAt,
        estimatedRewardInPaise: rewardInPaise,
        paidRewardInPaise,
        remainingRewardInPaise,
      };
    });
    const totals = coupons.reduce(
      (acc, couponRow) => {
        acc.usageCount += couponRow.usageCount;
        acc.totalRevenueInPaise += couponRow.totalRevenueInPaise;
        acc.totalDiscountInPaise += couponRow.totalDiscountInPaise;
        acc.totalRewardInPaise += couponRow.estimatedRewardInPaise;
        acc.totalPaidInPaise += couponRow.paidRewardInPaise;
        acc.remainingRewardInPaise += couponRow.remainingRewardInPaise;
        if (couponRow.creatorRewardStatus === "paid") {
          acc.pendingRewardInPaise += 0;
        } else {
          acc.pendingRewardInPaise += couponRow.remainingRewardInPaise;
        }
        return acc;
      },
      {
        usageCount: 0,
        totalRevenueInPaise: 0,
        totalDiscountInPaise: 0,
        totalRewardInPaise: 0,
        pendingRewardInPaise: 0,
        totalPaidInPaise: 0,
        remainingRewardInPaise: 0,
      }
    );

    return {
      creator: {
        id: creatorRecord.id,
        email: creatorRecord.email,
        name:
          [creatorRecord.firstName, creatorRecord.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() || creatorRecord.email,
      },
      coupons,
      totals,
    };
  } catch (error) {
    if (isTableMissingError(error)) {
      return null;
    }
    console.error("getCreatorCouponSummary failed", error);
    const cause =
      error instanceof Error && error.message
        ? error.message
        : "Failed to load creator summary";
    throw new ChatSDKError("bad_request:database", cause);
  }
}

export async function getCouponPayoutsForAdmin({
  couponIds,
  limitPerCoupon = 10,
}: {
  couponIds: string[];
  limitPerCoupon?: number;
}): Promise<Record<string, CouponRewardPayout[]>> {
  if (couponIds.length === 0) {
    return {};
  }
  const limit = Math.max(1, Math.min(limitPerCoupon, 50));
  const totalLimit = limit * couponIds.length;

  try {
    const rows = await db
      .select()
      .from(couponRewardPayout)
      .where(inArray(couponRewardPayout.couponId, couponIds))
      .orderBy(desc(couponRewardPayout.createdAt))
      .limit(totalLimit);

    const grouped = new Map<string, CouponRewardPayout[]>();
    for (const row of rows) {
      const existing = grouped.get(row.couponId) ?? [];
      if (existing.length < limit) {
        existing.push(row);
        grouped.set(row.couponId, existing);
      }
    }
    return Object.fromEntries(grouped.entries());
  } catch (error) {
    if (isTableMissingError(error)) {
      return {};
    }
    console.error("getCouponPayoutsForAdmin failed", error);
    throw new ChatSDKError(
      "bad_request:database",
      error instanceof Error && error.message
        ? error.message
        : "Failed to load coupon payouts"
    );
  }
}

export async function getCreatorCouponRedemptions({
  creatorId,
  page = 1,
  pageSize = 10,
  sortBy = "date",
  sortDirection = "desc",
}: {
  creatorId: string;
  page?: number;
  pageSize?: number;
  sortBy?: CreatorRedemptionSortField;
  sortDirection?: "asc" | "desc";
}): Promise<CreatorCouponRedemptionsResult> {
  const normalizedPage =
    Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1;
  const normalizedPageSize =
    Number.isFinite(pageSize) && pageSize && pageSize > 0
      ? Math.floor(pageSize)
      : 10;
  const limit = Math.min(normalizedPageSize, MAX_CREATOR_REDEMPTIONS_PAGE_SIZE);
  const offset = (normalizedPage - 1) * limit;
  const normalizedSortBy: CreatorRedemptionSortField =
    sortBy === "payment" ? "payment" : "date";
  const normalizedSortDirection = sortDirection === "asc" ? "asc" : "desc";

  const sortColumn =
    normalizedSortBy === "payment"
      ? couponRedemption.paymentAmount
      : couponRedemption.createdAt;
  const orderClause =
    normalizedSortDirection === "asc" ? asc(sortColumn) : desc(sortColumn);

  try {
    const [rows, totalResult] = await Promise.all([
      db
        .select({
          id: couponRedemption.id,
          couponId: couponRedemption.couponId,
          orderId: couponRedemption.orderId,
          paymentAmount: couponRedemption.paymentAmount,
          discountAmount: couponRedemption.discountAmount,
          createdAt: couponRedemption.createdAt,
          couponCode: coupon.code,
          creatorRewardPercentage: coupon.creatorRewardPercentage,
          userFirstName: user.firstName,
          userLastName: user.lastName,
          userEmail: user.email,
        })
        .from(couponRedemption)
        .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
        .innerJoin(user, eq(user.id, couponRedemption.userId))
        .where(eq(coupon.creatorId, creatorId))
        .orderBy(orderClause)
        .limit(limit)
        .offset(offset),
      db
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(couponRedemption)
        .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
        .where(eq(coupon.creatorId, creatorId)),
    ]);

    const totalCount = toInteger(totalResult?.[0]?.count);

    const redemptions: CreatorCouponRedemption[] = rows.map((row) => {
      const identifier =
        [row.userFirstName, row.userLastName]
          .filter((value): value is string =>
            Boolean(
              value && typeof value === "string" && value.trim().length > 0
            )
          )
          .join("") ||
        row.userEmail?.trim() ||
        null;
      const paymentAmountInPaise = toInteger(row.paymentAmount);
      const discountAmountInPaise = toInteger(row.discountAmount);
      const rewardInPaise = calculateRewardAmount(
        paymentAmountInPaise + discountAmountInPaise,
        row.creatorRewardPercentage ?? 0
      );

      return {
        id: row.id,
        couponId: row.couponId,
        couponCode: row.couponCode,
        orderId: row.orderId,
        userLabel: maskUserIdentifier(identifier),
        paymentAmountInPaise,
        discountAmountInPaise,
        rewardInPaise,
        createdAt: row.createdAt,
      };
    });

    return {
      redemptions,
      totalCount,
      page: normalizedPage,
      pageSize: limit,
      sortBy: normalizedSortBy,
      sortDirection: normalizedSortDirection,
    };
  } catch (error) {
    if (isTableMissingError(error)) {
      return {
        redemptions: [],
        totalCount: 0,
        page: normalizedPage,
        pageSize: limit,
        sortBy: normalizedSortBy,
        sortDirection: normalizedSortDirection,
      };
    }
    console.error("getCreatorCouponRedemptions failed", error);
    throw new ChatSDKError(
      "bad_request:database",
      error instanceof Error && error.message
        ? error.message
        : "Failed to load creator redemptions"
    );
  }
}

export async function getCouponRedemptionsForAdmin({
  couponIds,
  limitPerCoupon = 5,
}: {
  couponIds: string[];
  limitPerCoupon?: number;
}): Promise<Record<string, CouponRedemptionDetail[]>> {
  if (!couponIds.length) {
    return {};
  }
  const limit = Math.max(1, Math.min(limitPerCoupon, 25));
  const sliceSize = limit * couponIds.length;

  try {
    const rows = await db
      .select({
        id: couponRedemption.id,
        couponId: couponRedemption.couponId,
        couponCode: coupon.code,
        paymentAmount: couponRedemption.paymentAmount,
        discountAmount: couponRedemption.discountAmount,
        createdAt: couponRedemption.createdAt,
        creatorRewardPercentage: coupon.creatorRewardPercentage,
        userFirstName: user.firstName,
        userLastName: user.lastName,
        userEmail: user.email,
      })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(user, eq(user.id, couponRedemption.userId))
      .where(inArray(couponRedemption.couponId, couponIds))
      .orderBy(desc(couponRedemption.createdAt))
      .limit(sliceSize);

    const grouped = new Map<string, CouponRedemptionDetail[]>();

    for (const row of rows) {
      const identifier =
        [row.userFirstName, row.userLastName]
          .filter((value): value is string =>
            Boolean(
              value && typeof value === "string" && value.trim().length > 0
            )
          )
          .join("") ||
        row.userEmail?.trim() ||
        null;
      const paymentAmountInPaise = toInteger(row.paymentAmount);
      const discountAmountInPaise = toInteger(row.discountAmount);
      const rewardInPaise = calculateRewardAmount(
        paymentAmountInPaise + discountAmountInPaise,
        row.creatorRewardPercentage ?? 0
      );

      const detail: CouponRedemptionDetail = {
        id: row.id,
        couponId: row.couponId,
        couponCode: row.couponCode,
        userLabel: maskUserIdentifier(identifier),
        paymentAmountInPaise,
        discountAmountInPaise,
        rewardInPaise,
        createdAt: row.createdAt,
      };

      const existing = grouped.get(row.couponId) ?? [];
      if (existing.length < limit) {
        existing.push(detail);
        grouped.set(row.couponId, existing);
      }
    }

    return Object.fromEntries(grouped.entries());
  } catch (error) {
    if (isTableMissingError(error)) {
      return {};
    }
    console.error("getCouponRedemptionsForAdmin failed", error);
    throw new ChatSDKError(
      "bad_request:database",
      error instanceof Error && error.message
        ? error.message
        : "Failed to load coupon redemptions"
    );
  }
}

export async function createPaymentTransaction({
  userId,
  planId,
  orderId,
  amount,
  currency,
  notes = null,
  couponId = null,
  creatorId = null,
  discountAmount = 0,
}: {
  userId: string;
  planId: string;
  orderId: string;
  amount: number;
  currency: string;
  notes?: Record<string, unknown> | null;
  couponId?: string | null;
  creatorId?: string | null;
  discountAmount?: number;
}): Promise<PaymentTransaction> {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(paymentTransaction)
        .where(eq(paymentTransaction.orderId, orderId))
        .limit(1);

      if (existing) {
        return existing;
      }

      const [transaction] = await tx
        .insert(paymentTransaction)
        .values({
          orderId,
          userId,
          planId,
          amount,
          currency,
          couponId,
          creatorId,
          discountAmount: Math.max(0, discountAmount ?? 0),
          notes: notes ?? null,
        })
        .returning();

      if (!transaction) {
        throw new ChatSDKError(
          "bad_request:database",
          "Failed to record payment transaction"
        );
      }

      return transaction;
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }

    if (isTableMissingError(error)) {
      throw new ChatSDKError(
        "bad_request:database",
        "Payment transactions table is not available"
      );
    }

    throw new ChatSDKError(
      "bad_request:database",
      "Failed to record payment transaction"
    );
  }
}

export async function getPaymentTransactionByOrderId({
  orderId,
}: {
  orderId: string;
}): Promise<PaymentTransaction | null> {
  try {
    const [transaction] = await db
      .select()
      .from(paymentTransaction)
      .where(eq(paymentTransaction.orderId, orderId))
      .limit(1);

    return transaction ?? null;
  } catch (error) {
    if (isTableMissingError(error)) {
      return null;
    }

    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load payment transaction"
    );
  }
}

export async function markPaymentTransactionProcessing({
  orderId,
  userId,
}: {
  orderId: string;
  userId: string;
}): Promise<boolean> {
  try {
    const [transaction] = await db
      .update(paymentTransaction)
      .set({
        status: PAYMENT_STATUS_PROCESSING,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentTransaction.orderId, orderId),
          eq(paymentTransaction.userId, userId),
          eq(paymentTransaction.status, PAYMENT_STATUS_PENDING)
        )
      )
      .returning();

    return Boolean(transaction);
  } catch (error) {
    if (isTableMissingError(error)) {
      return false;
    }

    throw new ChatSDKError(
      "bad_request:database",
      "Failed to mark payment transaction as processing"
    );
  }
}

export async function markPaymentTransactionPaid({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<void> {
  try {
    await db
      .update(paymentTransaction)
      .set({
        status: PAYMENT_STATUS_PAID,
        paymentId,
        signature,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentTransaction.orderId, orderId),
          eq(paymentTransaction.status, PAYMENT_STATUS_PROCESSING)
        )
      )
      .returning();
  } catch (error) {
    if (isTableMissingError(error)) {
      return;
    }

    throw new ChatSDKError(
      "bad_request:database",
      "Failed to mark payment transaction as paid"
    );
  }
}

export async function markPaymentTransactionFailed({
  orderId,
}: {
  orderId: string;
}): Promise<void> {
  try {
    await db
      .update(paymentTransaction)
      .set({
        status: PAYMENT_STATUS_FAILED,
        updatedAt: new Date(),
      })
      .where(eq(paymentTransaction.orderId, orderId));
  } catch (error) {
    if (isTableMissingError(error)) {
      return;
    }

    throw new ChatSDKError(
      "bad_request:database",
      "Failed to mark payment transaction as failed"
    );
  }
}

export async function getActiveSubscriptionForUser(
  userId: string
): Promise<UserSubscription | null> {
  if (typeof userId !== "string" || !isValidUUID(userId)) {
    return null;
  }

  const now = new Date();

  try {
    return await getActiveSubscriptionInternal(db, userId, now);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return null;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load active subscription"
    );
  }
}

export async function hasAnySubscriptionForUser(
  userId: string
): Promise<boolean> {
  if (typeof userId !== "string" || !isValidUUID(userId)) {
    return false;
  }

  try {
    const [existing] = await db
      .select({ id: userSubscription.id })
      .from(userSubscription)
      .where(eq(userSubscription.userId, userId))
      .limit(1);

    return Boolean(existing);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return false;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to verify subscription history"
    );
  }
}

async function getLatestSubscriptionForUser(
  executor: any,
  userId: string
): Promise<UserSubscription | null> {
  const [latest] = await executor
    .select()
    .from(userSubscription)
    .where(eq(userSubscription.userId, userId))
    .orderBy(desc(userSubscription.updatedAt))
    .limit(1);

  return latest ?? null;
}

export async function createUserSubscription({
  userId,
  planId,
}: {
  userId: string;
  planId: string;
}): Promise<UserSubscription> {
  const now = new Date();

  try {
    return await db.transaction(async (tx) => {
      const [plan] = await tx
        .select()
        .from(pricingPlan)
        .where(and(eq(pricingPlan.id, planId), isNull(pricingPlan.deletedAt)))
        .limit(1);

      if (!plan) {
        throw new ChatSDKError(
          "not_found:pricing_plan",
          "Pricing plan not found"
        );
      }

      if (!plan.isActive) {
        throw new ChatSDKError(
          "bad_request:pricing_plan",
          "Selected plan is not currently active"
        );
      }

      const allowance = Math.max(0, plan.tokenAllowance);
      const isPaidPlan = plan.priceInPaise > 0;
      const expiresAt = addDays(now, Math.max(1, plan.billingCycleDays));
      const active = await getActiveSubscriptionInternal(tx, userId, now);

      if (active) {
        const currentManual = Math.max(0, active.manualTokenBalance ?? 0);
        const currentPaid = Math.max(0, active.paidTokenBalance ?? 0);
        const updatedManual = isPaidPlan
          ? currentManual
          : currentManual + allowance;
        const updatedPaid = isPaidPlan ? currentPaid + allowance : currentPaid;
        const updatedBalance = updatedManual + updatedPaid;

        const [updated] = await tx
          .update(userSubscription)
          .set({
            planId: plan.id,
            tokenAllowance: active.tokenAllowance + allowance,
            tokenBalance: updatedBalance,
            manualTokenBalance: updatedManual,
            paidTokenBalance: updatedPaid,
            expiresAt:
              active.expiresAt > expiresAt ? active.expiresAt : expiresAt,
            status: "active",
            updatedAt: now,
          })
          .where(eq(userSubscription.id, active.id))
          .returning();

        return updated;
      }

      const [subscription] = await tx
        .insert(userSubscription)
        .values({
          userId,
          planId: plan.id,
          status: "active",
          tokenAllowance: allowance,
          tokenBalance: allowance,
          manualTokenBalance: isPaidPlan ? 0 : allowance,
          paidTokenBalance: isPaidPlan ? allowance : 0,
          tokensUsed: 0,
          startedAt: now,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return subscription;
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create user subscription"
    );
  }
}

export async function grantUserCredits({
  userId,
  tokens,
  expiresInDays = 90,
}: {
  userId: string;
  tokens: number;
  expiresInDays?: number;
}): Promise<UserSubscription> {
  if (tokens <= 0) {
    throw new ChatSDKError(
      "bad_request:api",
      "Credits to grant must be greater than zero"
    );
  }

  const now = new Date();
  const expiresAt = addDays(now, Math.max(1, expiresInDays));

  try {
    return await db.transaction(async (tx) => {
      const active = await getActiveSubscriptionInternal(tx, userId, now);

      if (active) {
        const currentManual = Math.max(0, active.manualTokenBalance ?? 0);
        const currentPaid = Math.max(0, active.paidTokenBalance ?? 0);
        const updatedManual = currentManual + tokens;
        const updatedBalance = updatedManual + currentPaid;

        const [updated] = await tx
          .update(userSubscription)
          .set({
            tokenBalance: updatedBalance,
            tokenAllowance: active.tokenAllowance + tokens,
            manualTokenBalance: updatedManual,
            paidTokenBalance: currentPaid,
            expiresAt:
              active.expiresAt > expiresAt ? active.expiresAt : expiresAt,
            updatedAt: now,
          })
          .where(eq(userSubscription.id, active.id))
          .returning();

        return updated;
      }

      const plan = await ensureManualPlan(tx, now);

      const [subscription] = await tx
        .insert(userSubscription)
        .values({
          userId,
          planId: plan.id,
          status: "active",
          tokenAllowance: tokens,
          tokenBalance: tokens,
          manualTokenBalance: tokens,
          paidTokenBalance: 0,
          tokensUsed: 0,
          startedAt: now,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return subscription;
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to grant user credits"
    );
  }
}

export type UserBalanceSummary = {
  subscription: UserSubscription | null;
  plan: PricingPlan | null;
  tokensRemaining: number;
  tokensTotal: number;
  creditsRemaining: number;
  creditsTotal: number;
  allocatedCredits: number;
  rechargedCredits: number;
  expiresAt: Date | null;
  startedAt: Date | null;
};

const EMPTY_BALANCE: UserBalanceSummary = {
  subscription: null,
  plan: null,
  tokensRemaining: 0,
  tokensTotal: 0,
  creditsRemaining: 0,
  creditsTotal: 0,
  allocatedCredits: 0,
  rechargedCredits: 0,
  expiresAt: null,
  startedAt: null,
};

export type ActiveSubscriptionSummary = {
  subscriptionId: string;
  userEmail: string;
  planName: string | null;
  tokenAllowance: number;
  tokenBalance: number;
  expiresAt: Date;
};

export async function getUserBalanceSummary(
  userId: string
): Promise<UserBalanceSummary> {
  if (typeof userId !== "string" || !isValidUUID(userId)) {
    return EMPTY_BALANCE;
  }

  try {
    const subscription = await getActiveSubscriptionForUser(userId);
    const latestSubscription =
      subscription ?? (await getLatestSubscriptionForUser(db, userId));

    if (!latestSubscription) {
      return EMPTY_BALANCE;
    }

    const [plan] = await db
      .select()
      .from(pricingPlan)
      .where(
        and(
          eq(pricingPlan.id, latestSubscription.planId),
          isNull(pricingPlan.deletedAt)
        )
      )
      .limit(1);

    const tokensRemaining = Math.max(0, latestSubscription.tokenBalance);
    const tokensTotal = Math.max(0, latestSubscription.tokenAllowance);
    const creditsRemaining = tokensRemaining / TOKENS_PER_CREDIT;
    const creditsTotal = tokensTotal / TOKENS_PER_CREDIT;
    const manualTokens = Math.max(
      0,
      latestSubscription.manualTokenBalance ?? 0
    );
    const paidTokens = Math.max(0, latestSubscription.paidTokenBalance ?? 0);

    return {
      subscription: latestSubscription,
      plan: plan ?? null,
      tokensRemaining,
      tokensTotal,
      creditsRemaining,
      creditsTotal,
      allocatedCredits: manualTokens / TOKENS_PER_CREDIT,
      rechargedCredits: paidTokens / TOKENS_PER_CREDIT,
      expiresAt: latestSubscription.expiresAt,
      startedAt: latestSubscription.startedAt,
    };
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return EMPTY_BALANCE;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load user balance summary"
    );
  }
}

export async function listActiveSubscriptionSummaries({
  limit = 20,
}: {
  limit?: number;
} = {}): Promise<ActiveSubscriptionSummary[]> {
  const now = new Date();

  try {
    return await db
      .select({
        subscriptionId: userSubscription.id,
        userEmail: user.email,
        planName: pricingPlan.name,
        tokenAllowance: userSubscription.tokenAllowance,
        tokenBalance: userSubscription.tokenBalance,
        expiresAt: userSubscription.expiresAt,
      })
      .from(userSubscription)
      .innerJoin(user, eq(userSubscription.userId, user.id))
      .leftJoin(
        pricingPlan,
        and(
          eq(userSubscription.planId, pricingPlan.id),
          isNull(pricingPlan.deletedAt)
        )
      )
      .where(
        and(
          eq(userSubscription.status, "active"),
          gt(userSubscription.expiresAt, now),
          gt(userSubscription.tokenBalance, 0)
        )
      )
      .orderBy(desc(userSubscription.updatedAt))
      .limit(limit);
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list active subscriptions"
    );
  }
}

export async function recordTokenUsage({
  userId,
  chatId,
  modelConfigId,
  inputTokens,
  outputTokens,
  deductCredits = true,
}: {
  userId: string;
  chatId: string;
  modelConfigId: string | null;
  inputTokens: number;
  outputTokens: number;
  deductCredits?: boolean;
}): Promise<TokenUsage> {
  const totalTokens = Math.max(0, Math.round(inputTokens + outputTokens));

  if (totalTokens <= 0) {
    throw new ChatSDKError(
      "bad_request:usage",
      "Token usage must be greater than zero"
    );
  }

  const now = new Date();
  let exhausted = false;
  let baselineCostSnapshot: ProviderCostSnapshot | null = null;
  let modelCostSnapshot: ProviderCostSnapshot | null = null;
  let usdToInr = 0;

  if (deductCredits) {
    try {
      const rateResult = await getUsdToInrRate();
      if (
        rateResult &&
        Number.isFinite(rateResult.rate) &&
        rateResult.rate > 0
      ) {
        usdToInr = rateResult.rate;
      }
    } catch (error) {
      console.warn(
        "[token-usage] Failed to load USD to INR exchange rate. Falling back to default.",
        error
      );
    }

    if (!usdToInr || !Number.isFinite(usdToInr) || usdToInr <= 0) {
      usdToInr = getFallbackUsdToInrRate();
    }

    if (modelConfigId) {
      modelCostSnapshot = await getModelProviderCostSnapshot(
        modelConfigId,
        usdToInr
      );
    }

    baselineCostSnapshot = await getBaselineProviderCostSnapshot(
      usdToInr,
      modelCostSnapshot
    );
  }

  try {
    const usageRecord = await db.transaction(async (tx) => {
      let subscription: UserSubscription | null = null;
      let tokensToDeduct = 0;
      let manualTokensDeducted = 0;
      let paidTokensDeducted = 0;
      let remainingManualBalance = 0;
      let remainingPaidBalance = 0;

      if (deductCredits) {
        subscription = await getActiveSubscriptionInternal(tx, userId, now);

        if (!subscription) {
          throw new ChatSDKError(
            "payment_required:credits",
            "No active subscription found for user"
          );
        }

        const [plan] = await tx
          .select({
            id: pricingPlan.id,
            priceInPaise: pricingPlan.priceInPaise,
            tokenAllowance: pricingPlan.tokenAllowance,
          })
          .from(pricingPlan)
          .where(eq(pricingPlan.id, subscription.planId))
          .limit(1);

        const allowance =
          plan?.tokenAllowance && plan.tokenAllowance > 0
            ? plan.tokenAllowance
            : Math.max(subscription.tokenAllowance, 0);

        let planPricePerTokenPaise =
          plan && allowance && allowance > 0 && plan.priceInPaise > 0
            ? plan.priceInPaise / allowance
            : 0;

        if (!planPricePerTokenPaise || planPricePerTokenPaise <= 0) {
          planPricePerTokenPaise =
            baselineCostSnapshot?.costPerTokenPaise ??
            modelCostSnapshot?.costPerTokenPaise ??
            0;
        }

        const baselineCostPerTokenPaise =
          baselineCostSnapshot?.costPerTokenPaise ??
          modelCostSnapshot?.costPerTokenPaise ??
          planPricePerTokenPaise;

        const modelCostPerTokenPaise =
          modelCostSnapshot?.costPerTokenPaise ?? baselineCostPerTokenPaise;

        const costMultiplier = computeCostMultiplier({
          planPricePerTokenPaise,
          baselineCostPerTokenPaise,
          modelCostPerTokenPaise,
        });

        tokensToDeduct = calculateTokenDeduction({
          inputTokens,
          outputTokens,
          costMultiplier,
        });

        if (tokensToDeduct > 0 && subscription.tokenBalance < tokensToDeduct) {
          const consumedTokens = Math.max(0, subscription.tokenBalance);

          await tx
            .update(userSubscription)
            .set({
              tokenBalance: 0,
              manualTokenBalance: 0,
              paidTokenBalance: 0,
              tokensUsed: Math.min(
                subscription.tokenAllowance,
                subscription.tokensUsed + consumedTokens
              ),
              status: "exhausted",
              updatedAt: now,
            })
            .where(eq(userSubscription.id, subscription.id));

          exhausted = true;
          return null;
        }

        const manualBalance = Math.max(0, subscription.manualTokenBalance ?? 0);
        const paidBalance = Math.max(0, subscription.paidTokenBalance ?? 0);

        if (tokensToDeduct > 0) {
          manualTokensDeducted = Math.min(tokensToDeduct, manualBalance);
          paidTokensDeducted = Math.min(
            tokensToDeduct - manualTokensDeducted,
            paidBalance
          );
          remainingManualBalance = manualBalance - manualTokensDeducted;
          remainingPaidBalance = paidBalance - paidTokensDeducted;
        } else {
          remainingManualBalance = manualBalance;
          remainingPaidBalance = paidBalance;
        }
      }

      const [insertedUsage] = await tx
        .insert(tokenUsage)
        .values({
          userId,
          chatId,
          modelConfigId: modelConfigId ?? null,
          subscriptionId: subscription?.id ?? null,
          inputTokens,
          outputTokens,
          totalTokens,
          manualTokens: manualTokensDeducted,
          paidTokens: paidTokensDeducted,
          createdAt: now,
        })
        .returning();

      if (subscription) {
        const remaining =
          tokensToDeduct > 0
            ? Math.max(0, remainingManualBalance + remainingPaidBalance)
            : subscription.tokenBalance;

        await tx
          .update(userSubscription)
          .set({
            tokenBalance: remaining,
            manualTokenBalance:
              tokensToDeduct > 0
                ? remainingManualBalance
                : Math.max(0, subscription.manualTokenBalance ?? 0),
            paidTokenBalance:
              tokensToDeduct > 0
                ? remainingPaidBalance
                : Math.max(0, subscription.paidTokenBalance ?? 0),
            tokensUsed: subscription.tokensUsed + tokensToDeduct,
            status: remaining > 0 ? "active" : "exhausted",
            updatedAt: now,
          })
          .where(eq(userSubscription.id, subscription.id));
      }

      return insertedUsage ?? null;
    });

    if (exhausted) {
      throw new ChatSDKError(
        "payment_required:credits",
        "Insufficient credits remaining"
      );
    }

    if (!usageRecord) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to record token usage"
      );
    }

    return usageRecord;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to record token usage"
    );
  }
}

export async function deductImageCredits({
  userId,
  chatId,
  tokensToDeduct,
  allowManualCredits = true,
}: {
  userId: string;
  chatId: string;
  tokensToDeduct: number;
  allowManualCredits?: boolean;
}): Promise<void> {
  const resolvedTokens = Math.max(1, Math.round(tokensToDeduct));

  if (resolvedTokens <= 0) {
    throw new ChatSDKError(
      "bad_request:usage",
      "Token usage must be greater than zero"
    );
  }

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const subscription = await getActiveSubscriptionInternal(tx, userId, now);

      if (!subscription) {
        throw new ChatSDKError(
          "payment_required:credits",
          "No active subscription found for user"
        );
      }

      const manualBalance = Math.max(0, subscription.manualTokenBalance ?? 0);
      const paidBalance = Math.max(0, subscription.paidTokenBalance ?? 0);
      const availableBalance = allowManualCredits
        ? manualBalance + paidBalance
        : paidBalance;

      if (availableBalance < resolvedTokens) {
        if (allowManualCredits) {
          await tx
            .update(userSubscription)
            .set({
              tokenBalance: 0,
              manualTokenBalance: 0,
              paidTokenBalance: 0,
              tokensUsed: Math.min(
                subscription.tokenAllowance,
                subscription.tokensUsed + subscription.tokenBalance
              ),
              status: "exhausted",
              updatedAt: now,
            })
            .where(eq(userSubscription.id, subscription.id));
        }

        throw new ChatSDKError(
          "payment_required:credits",
          allowManualCredits
            ? "Insufficient credits remaining"
            : "Paid credits are required to generate images"
        );
      }

      const manualTokensDeducted = allowManualCredits
        ? Math.min(resolvedTokens, manualBalance)
        : 0;
      const paidTokensDeducted = allowManualCredits
        ? Math.min(resolvedTokens - manualTokensDeducted, paidBalance)
        : Math.min(resolvedTokens, paidBalance);
      const remainingManualBalance = allowManualCredits
        ? manualBalance - manualTokensDeducted
        : manualBalance;
      const remainingPaidBalance = paidBalance - paidTokensDeducted;
      const remaining = Math.max(
        0,
        remainingManualBalance + remainingPaidBalance
      );

      const [usageRecord] = await tx
        .insert(tokenUsage)
        .values({
          userId,
          chatId,
          modelConfigId: null,
          subscriptionId: subscription.id,
          inputTokens: resolvedTokens,
          outputTokens: 0,
          totalTokens: resolvedTokens,
          manualTokens: manualTokensDeducted,
          paidTokens: paidTokensDeducted,
          createdAt: now,
        })
        .returning();

      if (!usageRecord) {
        throw new ChatSDKError(
          "bad_request:database",
          "Failed to record image token usage"
        );
      }

      await tx
        .update(userSubscription)
        .set({
          tokenBalance: remaining,
          manualTokenBalance: remainingManualBalance,
          paidTokenBalance: remainingPaidBalance,
          tokensUsed: subscription.tokensUsed + resolvedTokens,
          status: remaining > 0 ? "active" : "exhausted",
          updatedAt: now,
        })
        .where(eq(userSubscription.id, subscription.id));
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to deduct image credits"
    );
  }
}

export async function getTokenUsageTotalsForUser(userId: string): Promise<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}> {
  try {
    const rows = await db
      .select({
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
      })
      .from(tokenUsage)
      .where(eq(tokenUsage.userId, userId));

    return rows.reduce(
      (acc, row) => ({
        inputTokens: acc.inputTokens + (row.inputTokens ?? 0),
        outputTokens: acc.outputTokens + (row.outputTokens ?? 0),
        totalTokens: acc.totalTokens + (row.totalTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    );
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load token usage totals"
    );
  }
}

function _dateToIstKey(date: Date): string {
  const istMillis = date.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMillis);
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function istKeyToDate(key: string): Date {
  const [yearStr = "", monthStr = "", dayStr = ""] = key.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return new Date(key);
  }

  const midnightIstMillis = Date.UTC(year, month - 1, day);
  return new Date(midnightIstMillis - IST_OFFSET_MS);
}

export async function getDailyTokenUsageForUser(
  userId: string,
  days: number
): Promise<Array<{ day: Date; totalTokens: number }>> {
  try {
    const windowStart = new Date(
      Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000
    );

    const istOffsetInterval = sql.raw(
      `interval '${IST_OFFSET_MINUTES} minutes'`
    );
    const dayKey = sql<string>`to_char((${tokenUsage.createdAt} + ${istOffsetInterval})::date, 'YYYY-MM-DD')`.as(
      "dayKey"
    );
    const totalTokens = sql<number>`sum(${tokenUsage.totalTokens})`.as(
      "totalTokens"
    );

    const rows = await db
      .select({
        dayKey,
        totalTokens,
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.userId, userId),
          gte(tokenUsage.createdAt, windowStart)
        )
      )
      .groupBy(dayKey)
      .orderBy(asc(dayKey));

    return rows.map((row) => ({
      day: istKeyToDate(row.dayKey),
      totalTokens: Number(row.totalTokens ?? 0),
    }));
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load daily token usage"
    );
  }
}

export async function getSessionTokenUsageForUser(
  userId: string,
  options: { sortBy?: "latest" | "usage" } = {}
): Promise<
  Array<{
    chatId: string;
    chatTitle: string | null;
    chatCreatedAt: Date | null;
    totalTokens: number;
    lastUsedAt: Date | null;
  }>
> {
  try {
    const sortBy = options.sortBy === "usage" ? "usage" : "latest";

    const totalTokens = sql<number>`sum(${tokenUsage.totalTokens})`.as(
      "totalTokens"
    );
    const lastUsedAt = sql<Date>`max(${tokenUsage.createdAt})`.as("lastUsedAt");

    const query = db
      .select({
        chatId: tokenUsage.chatId,
        chatTitle: chat.title,
        chatCreatedAt: chat.createdAt,
        totalTokens,
        lastUsedAt,
      })
      .from(tokenUsage)
      .leftJoin(chat, eq(tokenUsage.chatId, chat.id))
      .where(eq(tokenUsage.userId, userId))
      .groupBy(tokenUsage.chatId, chat.title, chat.createdAt);

    const orderedQuery =
      sortBy === "usage"
        ? query.orderBy(desc(totalTokens), desc(lastUsedAt))
        : query.orderBy(desc(lastUsedAt));

    const rows = await orderedQuery;

    return rows.map((row) => ({
      chatId: row.chatId,
      chatTitle: row.chatTitle,
      chatCreatedAt:
        row.chatCreatedAt instanceof Date
          ? row.chatCreatedAt
          : row.chatCreatedAt
            ? new Date(row.chatCreatedAt as unknown as string)
            : null,
      totalTokens: Number(row.totalTokens ?? 0),
      lastUsedAt:
        row.lastUsedAt instanceof Date
          ? row.lastUsedAt
          : row.lastUsedAt
            ? new Date(row.lastUsedAt as unknown as string)
            : null,
    }));
  } catch (_error) {
    if (isTableMissingError(_error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load session token usage"
    );
  }
}

function addDays(base: Date, amount: number) {
  return new Date(base.getTime() + amount * 24 * 60 * 60 * 1000);
}

function isTableMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorMessage =
    "message" in error && error.message
      ? String((error as { message?: unknown }).message)
      : "";

  const stack =
    "stack" in error && error.stack
      ? String((error as { stack?: unknown }).stack)
      : "";

  return (
    errorMessage.includes("does not exist") ||
    errorMessage.includes("undefined_table") ||
    stack.includes("does not exist") ||
    stack.includes("undefined_table")
  );
}

function _isColumnMissingError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorMessage =
    "message" in error && error.message
      ? String((error as { message?: unknown }).message)
      : "";

  const stack =
    "stack" in error && error.stack
      ? String((error as { stack?: unknown }).stack)
      : "";

  return (
    errorMessage.includes(`column "${columnName}"`) ||
    errorMessage.includes("undefined_column") ||
    stack.includes(`column "${columnName}"`) ||
    stack.includes("undefined_column")
  );
}

async function ensureManualPlan(executor: any, now: Date) {
  const [plan] = await executor
    .select()
    .from(pricingPlan)
    .where(eq(pricingPlan.id, MANUAL_TOP_UP_PLAN_ID))
    .limit(1);

  if (plan) {
    if (plan.deletedAt) {
      const [restored] = await executor
        .update(pricingPlan)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(pricingPlan.id, MANUAL_TOP_UP_PLAN_ID))
        .returning();

      return restored ?? plan;
    }

    return plan;
  }

  const [created] = await executor
    .insert(pricingPlan)
    .values({
      id: MANUAL_TOP_UP_PLAN_ID,
      name: "Manual credit top-up",
      description: "Credits granted directly by an administrator",
      priceInPaise: 0,
      tokenAllowance: 0,
      billingCycleDays: 365,
      isActive: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: pricingPlan.id,
      set: {
        updatedAt: now,
      },
    })
    .returning();

  return created;
}

async function getActiveSubscriptionInternal(
  executor: any,
  userId: string,
  now: Date
): Promise<UserSubscription | null> {
  // Ensure any expired subscriptions are marked before we attempt to read.
  await executor
    .update(userSubscription)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(userSubscription.userId, userId),
        eq(userSubscription.status, "active"),
        lte(userSubscription.expiresAt, now)
      )
    );

  const [subscription] = await executor
    .select()
    .from(userSubscription)
    .where(
      and(
        eq(userSubscription.userId, userId),
        eq(userSubscription.status, "active"),
        gt(userSubscription.expiresAt, now)
      )
    )
    .orderBy(desc(userSubscription.expiresAt))
    .limit(1);

  if (!subscription) {
    return null;
  }

  if (subscription.tokenBalance <= 0) {
    await executor
      .update(userSubscription)
      .set({
        status: "exhausted",
        tokenBalance: 0,
        manualTokenBalance: 0,
        paidTokenBalance: 0,
        updatedAt: now,
      })
      .where(eq(userSubscription.id, subscription.id));
    return null;
  }

  return subscription;
}

function calculateTokenDeduction({
  inputTokens,
  outputTokens,
  costMultiplier = 1,
}: {
  inputTokens: number;
  outputTokens: number;
  costMultiplier?: number;
}): number {
  const totalTokens = Math.max(1, Math.round(inputTokens + outputTokens));
  const normalizedMultiplier =
    Number.isFinite(costMultiplier) && costMultiplier && costMultiplier > 1
      ? costMultiplier
      : 1;
  const adjustedTokens = totalTokens * normalizedMultiplier;
  return Math.max(1, Math.ceil(adjustedTokens));
}

function computeCostMultiplier({
  planPricePerTokenPaise,
  baselineCostPerTokenPaise,
  modelCostPerTokenPaise,
}: {
  planPricePerTokenPaise: number;
  baselineCostPerTokenPaise: number;
  modelCostPerTokenPaise: number;
}): number {
  if (
    !Number.isFinite(planPricePerTokenPaise) ||
    planPricePerTokenPaise <= 0 ||
    !Number.isFinite(baselineCostPerTokenPaise) ||
    baselineCostPerTokenPaise <= 0 ||
    !Number.isFinite(modelCostPerTokenPaise) ||
    modelCostPerTokenPaise <= 0
  ) {
    return 1;
  }

  const targetRatio = planPricePerTokenPaise / baselineCostPerTokenPaise;

  if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
    return 1;
  }

  const requiredPricePerToken = modelCostPerTokenPaise * targetRatio;
  const multiplier = requiredPricePerToken / planPricePerTokenPaise;

  if (!Number.isFinite(multiplier) || multiplier <= 1) {
    return 1;
  }

  return multiplier;
}

type ProviderCostSnapshot = {
  modelId: string;
  isDefault: boolean;
  isMarginBaseline: boolean;
  costPerTokenPaise: number;
};

async function getModelProviderCostSnapshot(
  modelId: string,
  usdToInr: number
): Promise<ProviderCostSnapshot | null> {
  const [row] = await db
    .select({
      id: modelConfig.id,
      isDefault: modelConfig.isDefault,
      isMarginBaseline: modelConfig.isMarginBaseline,
      inputCost: modelConfig.inputProviderCostPerMillion,
      outputCost: modelConfig.outputProviderCostPerMillion,
      deletedAt: modelConfig.deletedAt,
    })
    .from(modelConfig)
    .where(eq(modelConfig.id, modelId))
    .limit(1);

  if (!row || row.deletedAt) {
    return null;
  }

  const totalUsdPerMillion =
    Number(row.inputCost ?? 0) + Number(row.outputCost ?? 0);
  return {
    modelId: row.id,
    isDefault: row.isDefault ?? false,
    isMarginBaseline: row.isMarginBaseline ?? false,
    costPerTokenPaise: convertUsdPerMillionToPaisePerToken(
      totalUsdPerMillion,
      usdToInr
    ),
  };
}

async function getBaselineProviderCostSnapshot(
  usdToInr: number,
  existingSnapshot?: ProviderCostSnapshot | null
): Promise<ProviderCostSnapshot | null> {
  if (existingSnapshot?.isMarginBaseline) {
    return existingSnapshot;
  }

  const [baselineModel] = await db
    .select({
      id: modelConfig.id,
      isDefault: modelConfig.isDefault,
      isMarginBaseline: modelConfig.isMarginBaseline,
      inputCost: modelConfig.inputProviderCostPerMillion,
      outputCost: modelConfig.outputProviderCostPerMillion,
    })
    .from(modelConfig)
    .where(
      and(
        eq(modelConfig.isMarginBaseline, true),
        eq(modelConfig.isEnabled, true),
        isNull(modelConfig.deletedAt)
      )
    )
    .limit(1);

  if (baselineModel) {
    const totalUsdPerMillion =
      Number(baselineModel.inputCost ?? 0) +
      Number(baselineModel.outputCost ?? 0);
    return {
      modelId: baselineModel.id,
      isDefault: baselineModel.isDefault ?? false,
      isMarginBaseline: true,
      costPerTokenPaise: convertUsdPerMillionToPaisePerToken(
        totalUsdPerMillion,
        usdToInr
      ),
    };
  }

  const [defaultModel] = await db
    .select({
      id: modelConfig.id,
      isDefault: modelConfig.isDefault,
      isMarginBaseline: modelConfig.isMarginBaseline,
      inputCost: modelConfig.inputProviderCostPerMillion,
      outputCost: modelConfig.outputProviderCostPerMillion,
    })
    .from(modelConfig)
    .where(
      and(
        eq(modelConfig.isDefault, true),
        eq(modelConfig.isEnabled, true),
        isNull(modelConfig.deletedAt)
      )
    )
    .limit(1);

  if (defaultModel) {
    const totalUsdPerMillion =
      Number(defaultModel.inputCost ?? 0) +
      Number(defaultModel.outputCost ?? 0);
    return {
      modelId: defaultModel.id,
      isDefault: true,
      isMarginBaseline: defaultModel.isMarginBaseline ?? false,
      costPerTokenPaise: convertUsdPerMillionToPaisePerToken(
        totalUsdPerMillion,
        usdToInr
      ),
    };
  }

  const [fallbackModel] = await db
    .select({
      id: modelConfig.id,
      isDefault: modelConfig.isDefault,
      isMarginBaseline: modelConfig.isMarginBaseline,
      inputCost: modelConfig.inputProviderCostPerMillion,
      outputCost: modelConfig.outputProviderCostPerMillion,
    })
    .from(modelConfig)
    .where(and(eq(modelConfig.isEnabled, true), isNull(modelConfig.deletedAt)))
    .orderBy(asc(modelConfig.createdAt))
    .limit(1);

  if (!fallbackModel) {
    return null;
  }

  const fallbackUsdPerMillion =
    Number(fallbackModel.inputCost ?? 0) +
    Number(fallbackModel.outputCost ?? 0);

  return {
    modelId: fallbackModel.id,
    isDefault: fallbackModel.isDefault ?? false,
    isMarginBaseline: fallbackModel.isMarginBaseline ?? false,
    costPerTokenPaise: convertUsdPerMillionToPaisePerToken(
      fallbackUsdPerMillion,
      usdToInr
    ),
  };
}

function convertUsdPerMillionToPaisePerToken(
  usdPerMillion: number,
  usdToInr: number
): number {
  if (!Number.isFinite(usdPerMillion) || usdPerMillion <= 0) {
    return 0;
  }
  const safeRate =
    Number.isFinite(usdToInr) && usdToInr > 0
      ? usdToInr
      : getFallbackUsdToInrRate();
  const perTokenUsd = usdPerMillion / 1_000_000;
  const perTokenInr = perTokenUsd * safeRate;
  return perTokenInr * 100;
}

export type TranslationTableEntry = {
  keyId: TranslationKey["id"];
  key: TranslationKey["key"];
  defaultText: TranslationKey["defaultText"];
  description: TranslationKey["description"];
  updatedAt: TranslationKey["updatedAt"];
  translations: Record<
    Language["code"],
    {
      translationId: TranslationValue["id"];
      languageId: Language["id"];
      value: TranslationValue["value"];
      updatedAt: TranslationValue["updatedAt"];
    }
  >;
};

export async function listTranslationEntries(): Promise<
  TranslationTableEntry[]
> {
  const keys = await db
    .select({
      id: translationKey.id,
      key: translationKey.key,
      defaultText: translationKey.defaultText,
      description: translationKey.description,
      updatedAt: translationKey.updatedAt,
    })
    .from(translationKey)
    .orderBy(asc(translationKey.key));

  if (keys.length === 0) {
    return [];
  }

  const values = await db
    .select({
      id: translationValue.id,
      translationKeyId: translationValue.translationKeyId,
      languageId: translationValue.languageId,
      value: translationValue.value,
      updatedAt: translationValue.updatedAt,
      languageCode: language.code,
    })
    .from(translationValue)
    .innerJoin(language, eq(translationValue.languageId, language.id));

  const entries = new Map<TranslationKey["id"], TranslationTableEntry>();

  for (const key of keys) {
    entries.set(key.id, {
      keyId: key.id,
      key: key.key,
      defaultText: key.defaultText,
      description: key.description,
      updatedAt: key.updatedAt,
      translations: {},
    });
  }

  for (const value of values) {
    const entry = entries.get(value.translationKeyId);
    if (!entry) {
      continue;
    }

    entry.translations[value.languageCode] = {
      translationId: value.id,
      languageId: value.languageId,
      value: value.value,
      updatedAt: value.updatedAt,
    };
  }

  return Array.from(entries.values());
}

export async function updateTranslationDefaultText({
  keyId,
  defaultText,
  description,
}: {
  keyId: TranslationKey["id"];
  defaultText: string;
  description?: string | null;
}) {
  await db
    .update(translationKey)
    .set({
      defaultText,
      description: description ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(translationKey.id, keyId));
}

export async function upsertTranslationValueEntry({
  translationKeyId,
  languageId,
  value,
}: {
  translationKeyId: TranslationValue["translationKeyId"];
  languageId: TranslationValue["languageId"];
  value: string;
}) {
  await db
    .insert(translationValue)
    .values({
      translationKeyId,
      languageId,
      value,
    })
    .onConflictDoUpdate({
      target: [translationValue.translationKeyId, translationValue.languageId],
      set: {
        value,
        updatedAt: sql`now()`,
      },
    });
}

export async function deleteTranslationValueEntry({
  translationKeyId,
  languageId,
}: {
  translationKeyId: TranslationValue["translationKeyId"];
  languageId: TranslationValue["languageId"];
}) {
  await db
    .delete(translationValue)
    .where(
      and(
        eq(translationValue.translationKeyId, translationKeyId),
        eq(translationValue.languageId, languageId)
      )
    );
}

export async function createLanguageEntry({
  code,
  name,
  isDefault = false,
  isActive = true,
}: {
  code: string;
  name: string;
  isDefault?: boolean;
  isActive?: boolean;
}): Promise<Language> {
  const normalizedCode = code.trim().toLowerCase();
  const normalizedName = name.trim();

  if (!normalizedCode) {
    throw new Error("Language code is required");
  }

  if (!LANGUAGE_CODE_REGEX.test(normalizedCode)) {
    throw new Error(
      "Language code must be 2-16 characters and use lowercase letters, numbers, or hyphens."
    );
  }

  if (!normalizedName) {
    throw new Error("Language name is required");
  }

  if (normalizedName.length > 64) {
    throw new Error("Language name must be 1-64 characters.");
  }

  const [existing] = await db
    .select({ id: language.id })
    .from(language)
    .where(eq(language.code, normalizedCode))
    .limit(1);

  if (existing) {
    throw new Error("Language code already exists");
  }

  if (isDefault) {
    await db.update(language).set({ isDefault: false });
  }

  const [inserted] = await db
    .insert(language)
    .values({
      code: normalizedCode,
      name: normalizedName,
      isDefault,
      isActive,
    })
    .returning();

  return inserted;
}

export type CurrencyTotal = {
  currency: string;
  amount: number;
};

export async function listPaidRechargeTotals(
  range?: DateRange
): Promise<CurrencyTotal[]> {
  try {
    const dateConditions = buildDateRangeConditions(
      paymentTransaction.updatedAt,
      range
    );

    const rows = await db
      .select({
        currency: paymentTransaction.currency,
        amount: sql<number>`COALESCE(SUM(${paymentTransaction.amount}), 0)`,
      })
      .from(paymentTransaction)
      .where(
        dateConditions.length > 0
          ? and(
              eq(paymentTransaction.status, PAYMENT_STATUS_PAID),
              ...dateConditions
            )
          : eq(paymentTransaction.status, PAYMENT_STATUS_PAID)
      )
      .groupBy(paymentTransaction.currency);

    return rows.map((row) => ({
      currency: row.currency ?? "INR",
      amount: convertSubunitAmount(row.amount ?? 0, row.currency ?? "INR"),
    }));
  } catch (error) {
    if (isTableMissingError(error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load recharge totals"
    );
  }
}

export type TokenUsageTotals = {
  totalInputTokens: number;
  totalOutputTokens: number;
  providerCostUsd: number;
};

export async function getTokenUsageTotals(
  range?: DateRange
): Promise<TokenUsageTotals> {
  try {
    const conditions = buildDateRangeConditions(tokenUsage.createdAt, range);

    const baseQuery = db
      .select({
        totalInputTokens: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
        providerCostUsd: sql<number>`
          COALESCE(SUM(
            (
              ${tokenUsage.inputTokens} * COALESCE(${modelConfig.inputProviderCostPerMillion}, 0) +
              ${tokenUsage.outputTokens} * COALESCE(${modelConfig.outputProviderCostPerMillion}, 0)
            ) / 1000000.0
          ), 0)
        `,
      })
      .from(tokenUsage)
      .leftJoin(modelConfig, eq(tokenUsage.modelConfigId, modelConfig.id));

    const query = conditions.length
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const [row] = await query;

    return {
      totalInputTokens: row?.totalInputTokens ?? 0,
      totalOutputTokens: row?.totalOutputTokens ?? 0,
      providerCostUsd: row?.providerCostUsd ?? 0,
    };
  } catch (error) {
    if (isTableMissingError(error)) {
      return {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        providerCostUsd: 0,
      };
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load token usage totals"
    );
  }
}

export type DailyFinancialMetric = {
  date: string;
  recharge: Record<string, number>;
  totalInputTokens: number;
  totalOutputTokens: number;
  providerCostUsd: number;
};

export async function getDailyFinancialMetrics(
  range?: DateRange
): Promise<DailyFinancialMetric[]> {
  try {
    const rechargeDate = sql<string>`date_trunc('day', ${paymentTransaction.createdAt})::date`;
    const rechargeDateConditions = buildDateRangeConditions(
      paymentTransaction.createdAt,
      range
    );
    const rechargeWhere =
      rechargeDateConditions.length > 0
        ? and(
            eq(paymentTransaction.status, PAYMENT_STATUS_PAID),
            ...rechargeDateConditions
          )
        : eq(paymentTransaction.status, PAYMENT_STATUS_PAID);

    const rechargeRows = await db
      .select({
        date: rechargeDate,
        currency: paymentTransaction.currency,
        amount: sql<number>`COALESCE(SUM(${paymentTransaction.amount}), 0)`,
      })
      .from(paymentTransaction)
      .where(rechargeWhere)
      .groupBy(rechargeDate, paymentTransaction.currency)
      .orderBy(rechargeDate);

    const usageDate = sql<string>`date_trunc('day', ${tokenUsage.createdAt})::date`;
    const usageConditions = buildDateRangeConditions(
      tokenUsage.createdAt,
      range
    );

    const usageQueryBase = db
      .select({
        date: usageDate,
        totalInputTokens: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
        providerCostUsd: sql<number>`
          COALESCE(SUM(
            (
              ${tokenUsage.inputTokens} * COALESCE(${modelConfig.inputProviderCostPerMillion}, 0) +
              ${tokenUsage.outputTokens} * COALESCE(${modelConfig.outputProviderCostPerMillion}, 0)
            ) / 1000000.0
          ), 0)
        `,
      })
      .from(tokenUsage)
      .leftJoin(modelConfig, eq(tokenUsage.modelConfigId, modelConfig.id));

    const usageWhere =
      usageConditions.length > 0 ? and(...usageConditions) : undefined;

    const usageQuery = usageWhere
      ? usageQueryBase.where(usageWhere)
      : usageQueryBase;

    const usageRows = await usageQuery.groupBy(usageDate).orderBy(usageDate);

    const metricsMap = new Map<string, DailyFinancialMetric>();

    const ensureDailyMetric = (date: string) => {
      const existing = metricsMap.get(date);
      if (existing) {
        return existing;
      }
      const initialMetric: DailyFinancialMetric = {
        date,
        recharge: {},
        totalInputTokens: 0,
        totalOutputTokens: 0,
        providerCostUsd: 0,
      };
      metricsMap.set(date, initialMetric);
      return initialMetric;
    };

    for (const row of rechargeRows) {
      const date = row.date;
      const metric = ensureDailyMetric(date);
      const currency = row.currency ?? "INR";
      metric.recharge[currency] =
        (metric.recharge[currency] ?? 0) +
        convertSubunitAmount(row.amount ?? 0, currency);
    }

    for (const row of usageRows) {
      const date = row.date;
      const metric = ensureDailyMetric(date);
      metric.totalInputTokens += row.totalInputTokens ?? 0;
      metric.totalOutputTokens += row.totalOutputTokens ?? 0;
      metric.providerCostUsd += row.providerCostUsd ?? 0;
    }

    return Array.from(metricsMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  } catch (error) {
    if (isTableMissingError(error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load financial metrics"
    );
  }
}

export type UserFinancialRecord = {
  date: string;
  userId: string;
  email: string | null;
  currency: string;
  rechargeAmount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  providerCostUsd: number;
};

export type UserFinancialRecordsResult = {
  total: number;
  records: UserFinancialRecord[];
};

export async function getUserFinancialRecords({
  range,
  limit = 20,
  offset = 0,
}: {
  range?: DateRange;
  limit?: number;
  offset?: number;
}): Promise<UserFinancialRecordsResult> {
  try {
    const rechargeDate = sql<string>`date_trunc('day', ${paymentTransaction.createdAt})::date`;
    const rechargeConditions = buildDateRangeConditions(
      paymentTransaction.createdAt,
      range
    );

    const rechargeWhere =
      rechargeConditions.length > 0
        ? and(
            eq(paymentTransaction.status, PAYMENT_STATUS_PAID),
            ...rechargeConditions
          )
        : eq(paymentTransaction.status, PAYMENT_STATUS_PAID);

    const rechargeRows = await db
      .select({
        date: rechargeDate,
        userId: paymentTransaction.userId,
        email: user.email,
        currency: paymentTransaction.currency,
        amount: sql<number>`COALESCE(SUM(${paymentTransaction.amount}), 0)`,
      })
      .from(paymentTransaction)
      .innerJoin(user, eq(paymentTransaction.userId, user.id))
      .where(rechargeWhere)
      .groupBy(
        rechargeDate,
        paymentTransaction.userId,
        user.email,
        paymentTransaction.currency
      );

    const usageDate = sql<string>`date_trunc('day', ${tokenUsage.createdAt})::date`;
    const usageConditions = buildDateRangeConditions(
      tokenUsage.createdAt,
      range
    );

    const usageQueryBase = db
      .select({
        date: usageDate,
        userId: tokenUsage.userId,
        totalInputTokens: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
        providerCostUsd: sql<number>`
          COALESCE(SUM(
            (
              ${tokenUsage.inputTokens} * COALESCE(${modelConfig.inputProviderCostPerMillion}, 0) +
              ${tokenUsage.outputTokens} * COALESCE(${modelConfig.outputProviderCostPerMillion}, 0)
            ) / 1000000.0
          ), 0)
        `,
      })
      .from(tokenUsage)
      .leftJoin(modelConfig, eq(tokenUsage.modelConfigId, modelConfig.id));

    const usageWhere =
      usageConditions.length > 0 ? and(...usageConditions) : undefined;

    const usageQuery = usageWhere
      ? usageQueryBase.where(usageWhere)
      : usageQueryBase;

    const usageRows = await usageQuery.groupBy(usageDate, tokenUsage.userId);

    const map = new Map<string, UserFinancialRecord>();

    const ensureRecord = (
      key: string,
      defaults: Omit<
        UserFinancialRecord,
        | "rechargeAmount"
        | "totalInputTokens"
        | "totalOutputTokens"
        | "providerCostUsd"
      > & {
        rechargeAmount?: number;
        totalInputTokens?: number;
        totalOutputTokens?: number;
        providerCostUsd?: number;
      }
    ) => {
      const existing = map.get(key);
      if (existing) {
        return existing;
      }
      const record: UserFinancialRecord = {
        rechargeAmount: defaults.rechargeAmount ?? 0,
        totalInputTokens: defaults.totalInputTokens ?? 0,
        totalOutputTokens: defaults.totalOutputTokens ?? 0,
        providerCostUsd: defaults.providerCostUsd ?? 0,
        ...defaults,
      };
      map.set(key, record);
      return record;
    };

    for (const row of rechargeRows) {
      const key = `${row.userId ?? "unknown"}::${row.date}`;
      const record = ensureRecord(key, {
        date: row.date,
        userId: row.userId ?? "unknown",
        email: row.email ?? null,
        currency: row.currency ?? "INR",
      });
      record.currency = row.currency ?? record.currency ?? "INR";
      record.rechargeAmount += convertSubunitAmount(
        row.amount ?? 0,
        row.currency ?? "INR"
      );
    }

    for (const row of usageRows) {
      const key = `${row.userId ?? "unknown"}::${row.date}`;
      const record = ensureRecord(key, {
        date: row.date,
        userId: row.userId ?? "unknown",
        email: null,
        currency: "INR",
      });
      record.totalInputTokens += row.totalInputTokens ?? 0;
      record.totalOutputTokens += row.totalOutputTokens ?? 0;
      record.providerCostUsd += row.providerCostUsd ?? 0;
    }

    const dataset = Array.from(map.values()).sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return a.userId.localeCompare(b.userId);
    });

    const total = dataset.length;
    const paged = dataset.slice(offset, offset + limit);

    return { total, records: paged };
  } catch (error) {
    if (isTableMissingError(error)) {
      return { total: 0, records: [] };
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load transaction records"
    );
  }
}

export type ChatFinancialSummary = {
  chatId: string;
  userId: string | null;
  email: string | null;
  chatCreatedAt: Date | null;
  usageStartedAt: Date | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  userChargeInr: number;
  providerCostUsd: number;
};

export type ChatFinancialSummariesResult = {
  total: number;
  totals: {
    totalInputTokens: number;
    totalOutputTokens: number;
    userChargeInr: number;
    providerCostUsd: number;
  };
  records: ChatFinancialSummary[];
};

export async function listChatFinancialSummaries({
  range,
  limit = 25,
  offset = 0,
}: {
  range?: DateRange;
  limit?: number;
  offset?: number;
}): Promise<ChatFinancialSummariesResult> {
  try {
    const toNumber = (value: unknown) => {
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const usageConditions = buildDateRangeConditions(
      tokenUsage.createdAt,
      range
    );

    const query = db
      .select({
        chatId: tokenUsage.chatId,
        userId: tokenUsage.userId,
        email: user.email,
        chatCreatedAt: chat.createdAt,
        usageStartedAt: sql<Date>`MIN(${tokenUsage.createdAt})`,
        totalInputTokens: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
        userChargeInr: sql<number>`
          COALESCE(SUM(
            CASE
              WHEN ${tokenUsage.subscriptionId} IS NULL
                OR ${pricingPlan.tokenAllowance} IS NULL
                OR ${pricingPlan.tokenAllowance} <= 0
              THEN 0
              ELSE ${tokenUsage.paidTokens} *
                ((${pricingPlan.priceInPaise} / 100.0) / ${pricingPlan.tokenAllowance})
            END
          ), 0)
        `,
        providerCostUsd: sql<number>`
          COALESCE(SUM(
            (
              ${tokenUsage.inputTokens} * COALESCE(${modelConfig.inputProviderCostPerMillion}, 0) +
              ${tokenUsage.outputTokens} * COALESCE(${modelConfig.outputProviderCostPerMillion}, 0)
            ) / 1000000.0
          ), 0)
        `,
      })
      .from(tokenUsage)
      .leftJoin(modelConfig, eq(tokenUsage.modelConfigId, modelConfig.id))
      .leftJoin(chat, eq(tokenUsage.chatId, chat.id))
      .leftJoin(user, eq(tokenUsage.userId, user.id))
      .leftJoin(
        userSubscription,
        eq(tokenUsage.subscriptionId, userSubscription.id)
      )
      .leftJoin(pricingPlan, eq(userSubscription.planId, pricingPlan.id))
      .groupBy(
        tokenUsage.chatId,
        tokenUsage.userId,
        user.email,
        chat.createdAt
      );

    const usageRows = await (usageConditions.length > 0
      ? query.where(and(...usageConditions))
      : query
    ).orderBy(desc(sql<Date>`MIN(${tokenUsage.createdAt})`));

    const normalizedRows = usageRows.map((row) => ({
      ...row,
      totalInputTokens: toNumber(row.totalInputTokens),
      totalOutputTokens: toNumber(row.totalOutputTokens),
      userChargeInr: toNumber(row.userChargeInr),
      providerCostUsd: toNumber(row.providerCostUsd),
    }));

    const total = normalizedRows.length;

    const aggregates = normalizedRows.reduce(
      (acc, row) => {
        acc.totalInputTokens += row.totalInputTokens ?? 0;
        acc.totalOutputTokens += row.totalOutputTokens ?? 0;
        acc.userChargeInr += row.userChargeInr ?? 0;
        acc.providerCostUsd += row.providerCostUsd ?? 0;
        return acc;
      },
      {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        userChargeInr: 0,
        providerCostUsd: 0,
      }
    );

    const records = normalizedRows.slice(offset, offset + limit);

    return {
      total,
      totals: aggregates,
      records,
    };
  } catch (error) {
    if (isTableMissingError(error)) {
      return {
        total: 0,
        totals: {
          totalInputTokens: 0,
          totalOutputTokens: 0,
          userChargeInr: 0,
          providerCostUsd: 0,
        },
        records: [],
      };
    }

    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load chat financial summaries"
    );
  }
}

export type RechargeRecord = {
  orderId: string;
  userId: string;
  email: string | null;
  planId: string;
  planName: string | null;
  currency: string;
  amount: number;
  status: PaymentTransaction["status"];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
};

export type RechargeRecordsResult = {
  total: number;
  records: RechargeRecord[];
};

export async function listRechargeRecords({
  range,
  limit = 25,
  offset = 0,
}: {
  range?: DateRange;
  limit?: number;
  offset?: number;
} = {}): Promise<RechargeRecordsResult> {
  try {
    const dateConditions = buildDateRangeConditions(
      paymentTransaction.createdAt,
      range
    );

    const whereClause =
      dateConditions.length > 0
        ? and(
            eq(paymentTransaction.status, PAYMENT_STATUS_PAID),
            ...dateConditions
          )
        : eq(paymentTransaction.status, PAYMENT_STATUS_PAID);

    const rows = await db
      .select({
        orderId: paymentTransaction.orderId,
        userId: paymentTransaction.userId,
        email: user.email,
        planId: paymentTransaction.planId,
        planName: pricingPlan.name,
        currency: paymentTransaction.currency,
        amount: paymentTransaction.amount,
        status: paymentTransaction.status,
        createdAt: paymentTransaction.createdAt,
        updatedAt: paymentTransaction.updatedAt,
        expiresAt: sql<Date | null>`MAX(${userSubscription.expiresAt})`,
      })
      .from(paymentTransaction)
      .leftJoin(user, eq(paymentTransaction.userId, user.id))
      .leftJoin(pricingPlan, eq(paymentTransaction.planId, pricingPlan.id))
      .leftJoin(
        userSubscription,
        and(
          eq(userSubscription.userId, paymentTransaction.userId),
          eq(userSubscription.planId, paymentTransaction.planId)
        )
      )
      .where(whereClause)
      .groupBy(
        paymentTransaction.orderId,
        paymentTransaction.userId,
        user.email,
        paymentTransaction.planId,
        pricingPlan.name,
        paymentTransaction.currency,
        paymentTransaction.amount,
        paymentTransaction.status,
        paymentTransaction.createdAt,
        paymentTransaction.updatedAt
      )
      .orderBy(desc(paymentTransaction.createdAt));

    const total = rows.length;
    const paged = rows.slice(offset, offset + limit);

    return {
      total,
      records: paged.map((row) => ({
        orderId: row.orderId,
        userId: row.userId,
        email: row.email ?? null,
        planId: row.planId,
        planName: row.planName ?? null,
        currency: row.currency,
        amount:
          typeof row.amount === "number" ? row.amount : Number(row.amount ?? 0),
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        expiresAt: row.expiresAt ?? null,
      })),
    };
  } catch (error) {
    if (isTableMissingError(error)) {
      return { total: 0, records: [] };
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load recharge records"
    );
  }
}

export type UserRechargeHistoryEntry = {
  orderId: string;
  planId: string;
  planName: string | null;
  currency: string;
  amount: number;
  status: PaymentTransaction["status"];
  createdAt: Date;
};

export async function listUserRechargeHistory({
  userId,
  limit = 10,
}: {
  userId: string;
  limit?: number;
}): Promise<UserRechargeHistoryEntry[]> {
  if (!userId) {
    return [];
  }

  try {
    const rows = await db
      .select({
        orderId: paymentTransaction.orderId,
        planId: paymentTransaction.planId,
        planName: pricingPlan.name,
        currency: paymentTransaction.currency,
        amount: paymentTransaction.amount,
        status: paymentTransaction.status,
        createdAt: paymentTransaction.createdAt,
      })
      .from(paymentTransaction)
      .leftJoin(pricingPlan, eq(paymentTransaction.planId, pricingPlan.id))
      .where(eq(paymentTransaction.userId, userId))
      .orderBy(desc(paymentTransaction.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      orderId: row.orderId,
      planId: row.planId,
      planName: row.planName ?? null,
      currency: (row.currency ?? "INR").toUpperCase(),
      amount: convertSubunitAmount(row.amount ?? 0, row.currency ?? "INR"),
      status: row.status,
      createdAt: row.createdAt,
    }));
  } catch (error) {
    if (isTableMissingError(error)) {
      return [];
    }
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load recharge history"
    );
  }
}

export async function getTranslationKeyByKey(key: string) {
  const [row] = await db
    .select()
    .from(translationKey)
    .where(eq(translationKey.key, key))
    .limit(1);

  return row ?? null;
}

export async function getTranslationValuesForKeys(keys: string[]) {
  if (!keys.length) {
    return {} as Record<string, Record<string, string>>;
  }

  const rows = await db
    .select({
      key: translationKey.key,
      value: translationValue.value,
      languageCode: language.code,
    })
    .from(translationValue)
    .innerJoin(
      translationKey,
      eq(translationValue.translationKeyId, translationKey.id)
    )
    .innerJoin(language, eq(translationValue.languageId, language.id))
    .where(inArray(translationKey.key, keys));

  const result: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    if (!result[row.languageCode]) {
      result[row.languageCode] = {};
    }
    result[row.languageCode][row.key] = row.value;
  }

  return result;
}

export async function getLanguageByIdRaw(id: string): Promise<Language | null> {
  const [row] = await db
    .select()
    .from(language)
    .where(eq(language.id, id))
    .limit(1);

  return row ?? null;
}

export async function updateLanguageActiveState({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  await db
    .update(language)
    .set({
      isActive,
      updatedAt: sql`now()`,
    })
    .where(eq(language.id, id));
}
