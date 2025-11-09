import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AppUsage } from "../usage";

export const userRoleEnum = pgEnum("user_role", ["regular", "admin"]);
export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const authProviderEnum = pgEnum("auth_provider", [
  "credentials",
  "google",
]);
export type AuthProvider = (typeof authProviderEnum.enumValues)[number];

export const user = pgTable(
  "User",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    email: varchar("email", { length: 64 }).notNull(),
    password: varchar("password", { length: 64 }),
    role: userRoleEnum("role").notNull().default("regular"),
    authProvider: authProviderEnum("authProvider")
      .notNull()
      .default("credentials"),
    isActive: boolean("isActive").notNull().default(true),
    image: text("image"),
    firstName: varchar("firstName", { length: 64 }),
    lastName: varchar("lastName", { length: 64 }),
    dateOfBirth: date("dateOfBirth"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("User_createdAt_idx").on(table.createdAt),
  })
);

export type User = InferSelectModel<typeof user>;

export const emailVerificationToken = pgTable(
  "EmailVerificationToken",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("EmailVerificationToken_token_idx").on(table.token),
    userIdx: index("EmailVerificationToken_user_idx").on(table.userId),
  })
);

export type EmailVerificationToken = InferSelectModel<
  typeof emailVerificationToken
>;

export const passwordResetToken = pgTable(
  "PasswordResetToken",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("PasswordResetToken_token_idx").on(table.token),
    userIdx: index("PasswordResetToken_user_idx").on(table.userId),
  })
);

export type PasswordResetToken = InferSelectModel<typeof passwordResetToken>;

export const modelProviderEnum = pgEnum("model_provider", [
  "openai",
  "anthropic",
  "google",
  "custom",
]);

export const modelConfig = pgTable("ModelConfig", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  provider: modelProviderEnum("provider").notNull(),
  providerModelId: varchar("providerModelId", { length: 128 }).notNull(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  description: text("description").notNull().default(""),
  systemPrompt: text("systemPrompt"),
  codeTemplate: text("codeTemplate"),
  supportsReasoning: boolean("supportsReasoning").notNull().default(false),
  reasoningTag: varchar("reasoningTag", { length: 32 }),
  config: jsonb("config"),
  isEnabled: boolean("isEnabled").notNull().default(true),
  isDefault: boolean("isDefault").notNull().default(false),
  freeMessagesPerDay: integer("freeMessagesPerDay").notNull().default(3),
  inputCostPerMillion: doublePrecision("inputCostPerMillion")
    .notNull()
    .default(0),
  outputCostPerMillion: doublePrecision("outputCostPerMillion")
    .notNull()
    .default(0),
  inputProviderCostPerMillion: doublePrecision("inputProviderCostPerMillion")
    .notNull()
    .default(0),
  outputProviderCostPerMillion: doublePrecision("outputProviderCostPerMillion")
    .notNull()
    .default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  deletedAt: timestamp("deletedAt"),
});

export type ModelConfig = InferSelectModel<typeof modelConfig>;

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "expired",
  "exhausted",
  "cancelled",
]);

export const pricingPlan = pgTable("PricingPlan", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  priceInPaise: integer("priceInPaise").notNull(),
  tokenAllowance: integer("tokenAllowance").notNull(),
  billingCycleDays: integer("billingCycleDays").notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  deletedAt: timestamp("deletedAt"),
});

export type PricingPlan = InferSelectModel<typeof pricingPlan>;

export const paymentTransactionStatusEnum = pgEnum(
  "payment_transaction_status",
  ["pending", "processing", "paid", "failed"]
);

export const paymentTransaction = pgTable(
  "PaymentTransaction",
  {
    orderId: varchar("orderId", { length: 64 }).primaryKey().notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: uuid("planId")
      .notNull()
      .references(() => pricingPlan.id, { onDelete: "restrict" }),
    status: paymentTransactionStatusEnum("status")
      .notNull()
      .default("pending"),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 16 }).notNull(),
    notes: jsonb("notes"),
    paymentId: varchar("paymentId", { length: 128 }),
    signature: varchar("signature", { length: 256 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("PaymentTransaction_user_idx").on(table.userId),
    planIdx: index("PaymentTransaction_plan_idx").on(table.planId),
    statusIdx: index("PaymentTransaction_status_idx").on(table.status),
  })
);

export type PaymentTransaction = InferSelectModel<typeof paymentTransaction>;

export const userSubscription = pgTable("UserSubscription", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  planId: uuid("planId")
    .notNull()
    .references(() => pricingPlan.id, { onDelete: "restrict" }),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  tokenAllowance: integer("tokenAllowance").notNull(),
  tokenBalance: integer("tokenBalance").notNull(),
  tokensUsed: integer("tokensUsed").notNull().default(0),
  startedAt: timestamp("startedAt").notNull().defaultNow(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type UserSubscription = InferSelectModel<typeof userSubscription>;

export const appSetting = pgTable("AppSetting", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type AppSetting = InferSelectModel<typeof appSetting>;

export const language = pgTable(
  "language",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 16 }).notNull().unique(),
    name: varchar("name", { length: 64 }).notNull(),
    isDefault: boolean("isDefault").notNull().default(false),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("language_code_idx").on(table.code),
  })
);

export type Language = InferSelectModel<typeof language>;

export const translationKey = pgTable(
  "translation_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 128 }).notNull().unique(),
    defaultText: text("defaultText").notNull(),
    description: text("description"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    keyIdx: uniqueIndex("translation_key_key_idx").on(table.key),
  })
);

export type TranslationKey = InferSelectModel<typeof translationKey>;

export const translationValue = pgTable(
  "translation_value",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    translationKeyId: uuid("translationKeyId")
      .notNull()
      .references(() => translationKey.id, { onDelete: "cascade" }),
    languageId: uuid("languageId")
      .notNull()
      .references(() => language.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    keyLanguageIdx: uniqueIndex("translation_value_key_lang_idx").on(
      table.translationKeyId,
      table.languageId
    ),
  })
);

export type TranslationValue = InferSelectModel<typeof translationValue>;

export const chat = pgTable(
  "Chat",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    visibility: varchar("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("private"),
    lastContext: jsonb("lastContext").$type<AppUsage | null>(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    createdAtIdx: index("Chat_createdAt_idx").on(table.createdAt),
  })
);

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

export const auditLog = pgTable(
  "AuditLog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actorId").notNull().references(() => user.id),
    action: varchar("action", { length: 128 }).notNull(),
    target: jsonb("target").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("AuditLog_createdAt_idx").on(table.createdAt),
  })
);

export type AuditLog = InferSelectModel<typeof auditLog>;

export const contactMessageStatusEnum = pgEnum("contact_message_status", [
  "new",
  "in_progress",
  "resolved",
  "archived",
]);
export type ContactMessageStatus =
  (typeof contactMessageStatusEnum.enumValues)[number];

export const contactMessage = pgTable(
  "ContactMessage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 128 }).notNull(),
    email: varchar("email", { length: 128 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    subject: varchar("subject", { length: 200 }).notNull(),
    message: text("message").notNull(),
    status: contactMessageStatusEnum("status").notNull().default("new"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("ContactMessage_status_idx").on(table.status),
    createdIdx: index("ContactMessage_created_idx").on(table.createdAt),
  })
);

export type ContactMessage = InferSelectModel<typeof contactMessage>;

export const tokenUsage = pgTable(
  "token_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    modelConfigId: uuid("modelConfigId").references(() => modelConfig.id, {
      onDelete: "set null",
    }),
    subscriptionId: uuid("subscriptionId").references(
      () => userSubscription.id,
      { onDelete: "set null" }
    ),
    inputTokens: integer("inputTokens").notNull().default(0),
    outputTokens: integer("outputTokens").notNull().default(0),
    totalTokens: integer("totalTokens").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("token_usage_user_idx").on(table.userId),
    chatIdx: index("token_usage_chat_idx").on(table.chatId),
    userChatIdx: index("token_usage_user_chat_idx").on(
      table.userId,
      table.chatId
    ),
    subscriptionIdx: index("token_usage_subscription_idx").on(
      table.subscriptionId
    ),
  })
);

export type TokenUsage = InferSelectModel<typeof tokenUsage>;

export const forumThreadStatusEnum = pgEnum("forum_thread_status", [
  "open",
  "resolved",
  "locked",
  "archived",
]);
export type ForumThreadStatus =
  (typeof forumThreadStatusEnum.enumValues)[number];

export const forumPostReactionTypeEnum = pgEnum("forum_post_reaction_type", [
  "like",
  "insightful",
  "support",
]);
export type ForumPostReactionType =
  (typeof forumPostReactionTypeEnum.enumValues)[number];

export const forumCategory = pgTable(
  "ForumCategory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 64 }),
    position: integer("position").notNull().default(0),
    isLocked: boolean("isLocked").notNull().default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("ForumCategory_slug_idx").on(table.slug),
    positionIdx: index("ForumCategory_position_idx").on(table.position),
  })
);

export type ForumCategory = InferSelectModel<typeof forumCategory>;

export const forumTag = pgTable(
  "ForumTag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 64 }).notNull(),
    label: varchar("label", { length: 64 }).notNull(),
    description: text("description"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("ForumTag_slug_idx").on(table.slug),
  })
);

export type ForumTag = InferSelectModel<typeof forumTag>;

export const forumThread = pgTable(
  "ForumThread",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("categoryId")
      .notNull()
      .references(() => forumCategory.id, { onDelete: "restrict" }),
    authorId: uuid("authorId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    summary: text("summary").notNull(),
    status: forumThreadStatusEnum("status").notNull().default("open"),
    isPinned: boolean("isPinned").notNull().default(false),
    isLocked: boolean("isLocked").notNull().default(false),
    totalReplies: integer("totalReplies").notNull().default(0),
    viewCount: integer("viewCount").notNull().default(0),
    lastReplyUserId: uuid("lastReplyUserId").references(() => user.id, {
      onDelete: "set null",
    }),
    lastRepliedAt: timestamp("lastRepliedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("ForumThread_slug_idx").on(table.slug),
    categoryIdx: index("ForumThread_category_idx").on(table.categoryId),
    statusIdx: index("ForumThread_status_idx").on(table.status),
    pinnedIdx: index("ForumThread_pinned_idx").on(table.isPinned),
  })
);

export type ForumThread = InferSelectModel<typeof forumThread>;

export const forumPost = pgTable(
  "ForumPost",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("threadId")
      .notNull()
      .references(() => forumThread.id, { onDelete: "cascade" }),
    authorId: uuid("authorId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    parentPostId: uuid("parentPostId").references(() => forumPost.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    isEdited: boolean("isEdited").notNull().default(false),
    isDeleted: boolean("isDeleted").notNull().default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    threadIdx: index("ForumPost_thread_idx").on(table.threadId),
    authorIdx: index("ForumPost_author_idx").on(table.authorId),
  })
);

export type ForumPost = InferSelectModel<typeof forumPost>;

export const forumThreadTag = pgTable(
  "ForumThreadTag",
  {
    threadId: uuid("threadId")
      .notNull()
      .references(() => forumThread.id, { onDelete: "cascade" }),
    tagId: uuid("tagId")
      .notNull()
      .references(() => forumTag.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.threadId, table.tagId] }),
    tagIdx: index("ForumThreadTag_tag_idx").on(table.tagId),
  })
);

export type ForumThreadTag = InferSelectModel<typeof forumThreadTag>;

export const forumThreadSubscription = pgTable(
  "ForumThreadSubscription",
  {
    threadId: uuid("threadId")
      .notNull()
      .references(() => forumThread.id, { onDelete: "cascade" }),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    notifyByEmail: boolean("notifyByEmail").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.threadId, table.userId] }),
    userIdx: index("ForumThreadSubscription_user_idx").on(table.userId),
  })
);

export type ForumThreadSubscription = InferSelectModel<
  typeof forumThreadSubscription
>;

export const forumPostReaction = pgTable(
  "ForumPostReaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("postId")
      .notNull()
      .references(() => forumPost.id, { onDelete: "cascade" }),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: forumPostReactionTypeEnum("type")
      .notNull()
      .default("like"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    postIdx: index("ForumPostReaction_post_idx").on(table.postId),
    uniqueReactionIdx: uniqueIndex("ForumPostReaction_unique_idx").on(
      table.postId,
      table.userId,
      table.type
    ),
  })
);

export type ForumPostReaction = InferSelectModel<typeof forumPostReaction>;
