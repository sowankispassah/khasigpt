import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { setDefaultResultOrder } from "node:dns";
import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { TOKENS_PER_CREDIT } from "../constants";
import { ChatSDKError } from "../errors";
import type { AppUsage } from "../usage";
import { generateUUID } from "../utils";
import {
  appSetting,
  auditLog,
  chat,
  document,
  emailVerificationToken,
  modelConfig,
  message,
  passwordResetToken,
  paymentTransaction,
  pricingPlan,
  stream,
  suggestion,
  tokenUsage,
  user,
  userSubscription,
  vote,
  type AppSetting,
  type AuditLog,
  type Chat,
  type DBMessage,
  type EmailVerificationToken,
  type ModelConfig,
  type PasswordResetToken,
  type PaymentTransaction,
  type PricingPlan,
  type Suggestion,
  type TokenUsage,
  type User,
  type UserSubscription,
} from "./schema";
import { generateHashedPassword } from "./utils";

try {
  setDefaultResultOrder("ipv4first");
} catch (_error) {
  // Older Node runtimes may not support setDefaultResultOrder; ignore.
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

// biome-ignore lint: Forbidden non-null assertion.
const client =
  globalDbState.postgresClient ?? postgres(process.env.POSTGRES_URL!, poolConfig);

globalDbState.postgresClient ??= client;

const db =
  globalDbState.drizzleDb ?? drizzle(client);

globalDbState.drizzleDb ??= db;

function normalizeEmailValue(email: string): string {
  return email.trim().toLowerCase();
}

const DEFAULT_COST_PER_MILLION = 1;
const MANUAL_TOP_UP_PLAN_ID = "00000000-0000-0000-0000-0000000000ff";

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
  try {
    const [record] = await db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    return record ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by id"
    );
  }
}

export async function createUser(email: string, password: string): Promise<User> {
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

export async function createOAuthUser(email: string, image: string | null = null): Promise<User> {
  const normalizedEmail = normalizeEmailValue(email);
  try {
    const [created] = await db
      .insert(user)
      .values({
        email: normalizedEmail,
        isActive: true,
        authProvider: "google",
        image,
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
  profile?: { image?: string | null }
): Promise<User> {
  const normalizedEmail = normalizeEmailValue(email);
  const [existing] = await getUser(normalizedEmail);

  if (existing) {
    let userRecord = existing;

    if (!userRecord.isActive) {
      throw new ChatSDKError("forbidden:auth", "account_inactive");
    }

    if (userRecord.authProvider !== "google") {
      const updatedProvider = await updateUserAuthProvider({
        id: userRecord.id,
        authProvider: "google",
      });
      userRecord = updatedProvider ?? userRecord;
    }

    if (
      profile?.image &&
      (!userRecord.image || userRecord.image !== profile.image)
    ) {
      const updatedImage = await updateUserImage({
        id: userRecord.id,
        image: profile.image,
      });
      userRecord = updatedImage ?? userRecord;
    }

    return userRecord;
  }

  return await createOAuthUser(normalizedEmail, profile?.image ?? null);
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

export async function deletePasswordResetTokenById({
  id,
}: {
  id: string;
}) {
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
      await deleteEmailVerificationTokensForUser({ userId: tokenRecord.userId });
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
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to restore chat"
    );
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
        .where(whereCondition ? and(whereCondition, baseCondition) : baseCondition)
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
    throw new ChatSDKError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await db.insert(message).values(messages);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save messages");
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
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
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

export async function updateUserDateOfBirth({
  id,
  dateOfBirth,
}: {
  id: string;
  dateOfBirth: string;
}) {
  try {
    const [updated] = await db
      .update(user)
      .set({
        dateOfBirth,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update date of birth"
    );
  }
}

export async function updateUserImage({
  id,
  image,
}: {
  id: string;
  image: string | null;
}) {
  try {
    const [updated] = await db
      .update(user)
      .set({
        image,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();

    return updated ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update user profile image"
    );
  }
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
      whereCondition !== undefined ? baseQuery.where(whereCondition) : baseQuery;

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
      : !includeDeleted
        ? (isNull(chat.deletedAt) as SQL<boolean>)
        : undefined;

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

export async function getAppSettings(): Promise<AppSetting[]> {
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

export async function getAppSetting<T>(key: string): Promise<T | null> {
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

export async function createAuditLogEntry({
  actorId,
  action,
  target,
  metadata,
}: {
  actorId: string;
  action: string;
  target: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}): Promise<AuditLog | null> {
  try {
    const [entry] = await db
      .insert(auditLog)
      .values({
        actorId,
        action,
        target,
        metadata: metadata ?? null,
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
}: {
  limit?: number;
  offset?: number;
} = {}): Promise<AuditLog[]> {
  try {
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
          and(eq(auditLog.action, "billing.manual_credit.grant"), targetUserCondition),
          and(eq(auditLog.action, "billing.recharge"), eq(auditLog.actorId, userId))
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
  inputCostPerMillion = DEFAULT_COST_PER_MILLION,
  outputCostPerMillion = DEFAULT_COST_PER_MILLION,
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
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
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
        inputCostPerMillion,
        outputCostPerMillion,
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

    if (isDefault) {
      await setDefaultModelConfig(created.id);
      return { ...created, isDefault: true };
    }

    return created;
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
      : !includeDeleted
        ? (isNull(modelConfig.deletedAt) as SQL<boolean>)
        : undefined;

    const enabledCondition = includeDisabled
      ? undefined
      : (eq(modelConfig.isEnabled, true) as SQL<boolean>);

    const whereCondition =
      deletedCondition && enabledCondition
        ? (and(deletedCondition, enabledCondition) as SQL<boolean>)
        : deletedCondition ?? enabledCondition;

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
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
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
    if (patch.inputCostPerMillion !== undefined) {
      updateData.inputCostPerMillion = patch.inputCostPerMillion;
    }
    if (patch.outputCostPerMillion !== undefined) {
      updateData.outputCostPerMillion = patch.outputCostPerMillion;
    }

    const [updated] = await db
      .update(modelConfig)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(and(eq(modelConfig.id, id), isNull(modelConfig.deletedAt)))
      .returning();

    return updated ?? null;
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
      .set({ deletedAt: new Date(), isDefault: false, isEnabled: false })
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
        .where(and(eq(modelConfig.isDefault, true), isNull(modelConfig.deletedAt)));

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

export async function createPaymentTransaction({
  userId,
  planId,
  orderId,
  amount,
  currency,
  notes = null,
}: {
  userId: string;
  planId: string;
  orderId: string;
  amount: number;
  currency: string;
  notes?: Record<string, unknown> | null;
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
      const expiresAt = addDays(now, Math.max(1, plan.billingCycleDays));
      const active = await getActiveSubscriptionInternal(tx, userId, now);

      if (active) {
        const [updated] = await tx
          .update(userSubscription)
          .set({
            planId: plan.id,
            tokenAllowance: active.tokenAllowance + allowance,
            tokenBalance: active.tokenBalance + allowance,
            expiresAt: active.expiresAt > expiresAt ? active.expiresAt : expiresAt,
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
        const [updated] = await tx
          .update(userSubscription)
          .set({
            tokenBalance: active.tokenBalance + tokens,
            tokenAllowance: active.tokenAllowance + tokens,
            expiresAt: active.expiresAt > expiresAt ? active.expiresAt : expiresAt,
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
    const creditsRemaining = Math.floor(tokensRemaining / TOKENS_PER_CREDIT);
    const creditsTotal = Math.floor(tokensTotal / TOKENS_PER_CREDIT);

    return {
      subscription: latestSubscription,
      plan: plan ?? null,
      tokensRemaining,
      tokensTotal,
      creditsRemaining,
      creditsTotal,
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
        and(eq(userSubscription.planId, pricingPlan.id), isNull(pricingPlan.deletedAt))
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
}: {
  userId: string;
  chatId: string;
  modelConfigId: string | null;
  inputTokens: number;
  outputTokens: number;
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

  try {
    const usage = await db.transaction(async (tx) => {
      let inputRate = DEFAULT_COST_PER_MILLION;
      let outputRate = DEFAULT_COST_PER_MILLION;

      if (modelConfigId) {
        const [config] = await tx
          .select({
            inputCostPerMillion: modelConfig.inputCostPerMillion,
            outputCostPerMillion: modelConfig.outputCostPerMillion,
          })
          .from(modelConfig)
          .where(eq(modelConfig.id, modelConfigId))
          .limit(1);

        if (config) {
          const normalizedInput = normalizeCostRate(config.inputCostPerMillion);
          const normalizedOutput = normalizeCostRate(
            config.outputCostPerMillion
          );
          if (normalizedInput !== null) {
            inputRate = normalizedInput;
          }
          if (normalizedOutput !== null) {
            outputRate = normalizedOutput;
          }
        }
      }

      const subscription = await getActiveSubscriptionInternal(tx, userId, now);

      if (!subscription) {
        throw new ChatSDKError(
          "payment_required:credits",
          "No active subscription found for user"
        );
      }

      const tokensToDeduct = calculateTokenDeduction({
        inputTokens,
        outputTokens,
        inputRate,
        outputRate,
      });

      if (
        tokensToDeduct > 0 &&
        subscription.tokenBalance < tokensToDeduct
      ) {
        const consumedTokens = Math.max(0, subscription.tokenBalance);

        await tx
          .update(userSubscription)
          .set({
            tokenBalance: 0,
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

      const [usage] = await tx
        .insert(tokenUsage)
        .values({
          userId,
          chatId,
          modelConfigId: modelConfigId ?? null,
          subscriptionId: subscription.id,
          inputTokens,
          outputTokens,
          totalTokens,
          createdAt: now,
        })
        .returning();

      const remaining = subscription.tokenBalance - tokensToDeduct;

      await tx
        .update(userSubscription)
        .set({
          tokenBalance: remaining,
          tokensUsed: subscription.tokensUsed + tokensToDeduct,
          status: remaining > 0 ? "active" : "exhausted",
          updatedAt: now,
        })
        .where(eq(userSubscription.id, subscription.id));

      return usage ?? null;
    });

    if (exhausted) {
      throw new ChatSDKError(
        "payment_required:credits",
        "Insufficient credits remaining"
      );
    }

    if (!usage) {
      throw new ChatSDKError(
        "bad_request:database",
        "Failed to record token usage"
      );
    }

    return usage;
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

export async function getDailyTokenUsageForUser(
  userId: string,
  days: number
): Promise<Array<{ day: Date; totalTokens: number }>> {
  try {
    const windowStart = new Date(
      Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000
    );

    const rows = await db
      .select({
        createdAt: tokenUsage.createdAt,
        totalTokens: tokenUsage.totalTokens,
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.userId, userId),
          gte(tokenUsage.createdAt, windowStart)
        )
      )
      .orderBy(desc(tokenUsage.createdAt));

    const buckets = new Map<string, number>();

    for (const row of rows) {
      const created =
        row.createdAt instanceof Date
          ? row.createdAt
          : new Date(row.createdAt as unknown as string);
      const key = created.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + (row.totalTokens ?? 0));
    }

    return Array.from(buckets.entries())
      .map(([day, totalTokens]) => ({
        day: new Date(`${day}T00:00:00.000Z`),
        totalTokens,
      }))
      .sort((a, b) => a.day.getTime() - b.day.getTime());
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
  userId: string
): Promise<Array<{ chatId: string; totalTokens: number }>> {
  try {
    const rows = await db
      .select({
        chatId: tokenUsage.chatId,
        totalTokens: tokenUsage.totalTokens,
      })
      .from(tokenUsage)
      .where(eq(tokenUsage.userId, userId));

    const aggregates = new Map<string, number>();

    for (const row of rows) {
      if (!row.chatId) {
        continue;
      }
      aggregates.set(
        row.chatId,
        (aggregates.get(row.chatId) ?? 0) + (row.totalTokens ?? 0)
      );
    }

    return Array.from(aggregates.entries())
      .map(([chatId, totalTokens]) => ({ chatId, totalTokens }))
      .sort((a, b) => b.totalTokens - a.totalTokens);
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

  const message =
    "message" in error && error.message
      ? String((error as { message?: unknown }).message)
      : "";

  const stack =
    "stack" in error && error.stack
      ? String((error as { stack?: unknown }).stack)
      : "";

  return (
    message.includes("does not exist") ||
    message.includes("undefined_table") ||
    stack.includes("does not exist") ||
    stack.includes("undefined_table")
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
        updatedAt: now,
      })
      .where(eq(userSubscription.id, subscription.id));
    return null;
  }

  return subscription;
}

function normalizeCostRate(rate: number | null | undefined): number | null {
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    return null;
  }

  if (rate <= 0) {
    return null;
  }

  return rate;
}

function calculateTokenDeduction({
  inputTokens,
  outputTokens,
  inputRate,
  outputRate,
}: {
  inputTokens: number;
  outputTokens: number;
  inputRate: number;
  outputRate: number;
}): number {
  const normalizedInputRate =
    typeof inputRate === "number"
      ? inputRate
      : DEFAULT_COST_PER_MILLION;
  const normalizedOutputRate =
    typeof outputRate === "number"
      ? outputRate
      : DEFAULT_COST_PER_MILLION;

  const weightedInput =
    (inputTokens * normalizedInputRate) / DEFAULT_COST_PER_MILLION;
  const weightedOutput =
    (outputTokens * normalizedOutputRate) / DEFAULT_COST_PER_MILLION;

  const total = weightedInput + weightedOutput;

  if (!Number.isFinite(total) || total <= 0) {
    return TOKENS_PER_CREDIT;
  }

  const creditsToDeduct = Math.max(
    1,
    Math.ceil(total / TOKENS_PER_CREDIT)
  );

  return creditsToDeduct * TOKENS_PER_CREDIT;
}
