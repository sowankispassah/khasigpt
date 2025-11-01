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

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  role: userRoleEnum("role").notNull().default("regular"),
  authProvider: authProviderEnum("authProvider")
    .notNull()
    .default("credentials"),
  isActive: boolean("isActive").notNull().default(true),
  image: text("image"),
  dateOfBirth: date("dateOfBirth"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

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
  inputCostPerMillion: doublePrecision("inputCostPerMillion")
    .notNull()
    .default(0),
  outputCostPerMillion: doublePrecision("outputCostPerMillion")
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

export const chat = pgTable("Chat", {
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
});

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

export const auditLog = pgTable("AuditLog", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actorId").notNull().references(() => user.id),
  action: varchar("action", { length: 128 }).notNull(),
  target: jsonb("target").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

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
