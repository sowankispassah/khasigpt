"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";

import { auth } from "@/app/(auth)/auth";
import { IMAGE_MODEL_REGISTRY_CACHE_TAG } from "@/lib/ai/image-model-registry";
import { MODEL_REGISTRY_CACHE_TAG } from "@/lib/ai/model-registry";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DEFAULT_FREE_MESSAGES_PER_DAY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  FORUM_FEATURE_FLAG_KEY,
  FREE_MESSAGE_SETTINGS_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  ICON_PROMPTS_SETTING_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY,
  IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY,
  PRICING_PLAN_CACHE_TAG,
  RECOMMENDED_PRICING_PLAN_SETTING_KEY,
  SITE_COMING_SOON_CONTENT_SETTING_KEY,
  SITE_COMING_SOON_TIMER_SETTING_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  TOKENS_PER_CREDIT,
} from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  createAuditLogEntry,
  createCharacterWithAliases,
  createImageModelConfig,
  createPrelaunchInviteToken,
  createLanguageEntry,
  createModelConfig,
  createPricingPlan,
  deleteCharacterById,
  deleteChatById,
  deleteImageModelConfig,
  deleteLanguageById,
  deleteModelConfig,
  deletePricingPlan,
  deleteTranslationValueEntry,
  getAppSetting,
  getImageModelConfigByKey,
  getLanguageByIdRaw,
  getModelConfigById,
  getModelConfigByKey,
  getPricingPlanById,
  getTranslationKeyByKey,
  grantUserCredits,
  hardDeleteChatById,
  hardDeleteImageModelConfig,
  hardDeleteModelConfig,
  hardDeletePricingPlan,
  recordCouponRewardPayout,
  restoreChatById,
  revokePrelaunchInviteAccessForUser,
  revokePrelaunchInviteToken,
  setActiveImageModelConfig,
  setAppSetting,
  setCouponRewardStatus,
  setCouponStatus,
  setDefaultModelConfig,
  setMarginBaselineModel,
  updateCharacterWithAliases,
  updateImageModelConfig,
  updateLanguageActiveState,
  updateLanguageDetails,
  updateModelConfig,
  updatePricingPlan,
  updateUserActiveState,
  updateUserPersonalKnowledgePermission,
  updateUserRole,
  upsertCoupon,
  upsertTranslationValueEntry,
} from "@/lib/db/queries";
import type {
  CharacterRefImage,
  RagEntryApprovalStatus,
  RagEntryStatus,
  UserRole,
} from "@/lib/db/schema";
import { normalizeFreeMessageSettings } from "@/lib/free-messages";
import {
  invalidateTranslationBundleCache,
  registerTranslationKeys,
} from "@/lib/i18n/dictionary";
import { getDefaultLanguage, getLanguageByCode } from "@/lib/i18n/languages";
import { normalizeIconPromptSettings } from "@/lib/icon-prompts";
import {
  sanitizeComingSoonContentInput,
  sanitizeComingSoonTimerInput,
} from "@/lib/settings/coming-soon";
import {
  bulkUpdateRagStatus,
  createRagCategory,
  createRagEntry,
  deletePersonalKnowledgeEntry,
  deleteRagEntries,
  rebuildAllRagFileSearchIndexes,
  restoreRagEntry,
  restoreRagVersion,
  updateRagEntry,
  updateUserAddedKnowledgeApproval,
} from "@/lib/rag/service";
import type { UpsertRagEntryInput } from "@/lib/rag/types";
import {
  JOB_POSTING_MAX_TEXT_CHARS,
  buildJobPostingMetadata,
  getJobPostingById,
  listJobPostingEntries,
} from "@/lib/jobs/service";
import type { JobPostingRecord } from "@/lib/jobs/types";
import {
  buildQuestionPaperMetadata,
  extractStudyYear,
  getQuestionPaperById,
  listQuestionPaperEntries,
  QUESTION_PAPER_MAX_TEXT_CHARS,
} from "@/lib/study/service";
import type { QuestionPaperRecord } from "@/lib/study/types";
import { extractDocumentTextFromBuffer } from "@/lib/uploads/document-parser";
import {
  DOCUMENT_EXTENSION_BY_MIME,
  IMAGE_MIME_TYPES,
  isDocumentMimeType,
} from "@/lib/uploads/document-uploads";
import { generateUUID } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";
import {
  parseFeatureAccessMode,
  type FeatureAccessMode,
} from "@/lib/feature-access";

async function requireAdmin() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    throw new Error("forbidden");
  }

  return session.user;
}

function revalidateAppSettingCache(key: string) {
  revalidateTag(appSettingCacheTagForKey(key));
}

const ADMIN_ACTION_AUDIT_TIMEOUT_MS = 3000;
const FEATURE_ACCESS_SETTING_TIMEOUT_MS = 12000;

async function createAuditLogEntrySafely(
  entry: Parameters<typeof createAuditLogEntry>[0]
) {
  await withTimeout(
    createAuditLogEntry(entry),
    ADMIN_ACTION_AUDIT_TIMEOUT_MS
  ).catch((error) => {
    console.error(
      `[admin/actions] Audit log write timed out or failed for action "${entry.action}".`,
      error
    );
    return null;
  });
}

async function resolveFeatureAccessModeFromForm({
  formData,
  fieldName,
  settingKey,
  fallbackMode,
}: {
  formData: FormData;
  fieldName: string;
  settingKey: string;
  fallbackMode: FeatureAccessMode;
}): Promise<FeatureAccessMode> {
  const submittedValue = formData.get(fieldName);
  if (typeof submittedValue === "string" && submittedValue.trim().length > 0) {
    return parseFeatureAccessMode(submittedValue, fallbackMode);
  }

  const existingValue = await getAppSetting<string | boolean | number>(settingKey);
  return parseFeatureAccessMode(existingValue, fallbackMode);
}

async function updateFeatureAccessModeSetting({
  actorId,
  auditAction,
  fallbackMode,
  fieldName,
  formData,
  settingKey,
}: {
  actorId: string;
  auditAction: string;
  fallbackMode: FeatureAccessMode;
  fieldName: string;
  formData: FormData;
  settingKey: string;
}) {
  const accessMode = await withTimeout(
    resolveFeatureAccessModeFromForm({
      formData,
      fieldName,
      settingKey,
      fallbackMode,
    }),
    FEATURE_ACCESS_SETTING_TIMEOUT_MS,
    () => {
      console.error(
        `[admin/actions] Feature access mode resolution timed out for "${settingKey}".`
      );
    }
  );

  await withTimeout(
    setAppSetting({
      key: settingKey,
      value: accessMode,
    }),
    FEATURE_ACCESS_SETTING_TIMEOUT_MS,
    () => {
      console.error(
        `[admin/actions] Feature access setting update timed out for "${settingKey}".`
      );
    }
  );

  revalidateAppSettingCache(settingKey);
  void createAuditLogEntrySafely({
    actorId,
    action: auditAction,
    target: { setting: settingKey },
    metadata: { accessMode },
  });
}

export async function setUserRoleAction({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}) {
  const actor = await requireAdmin();

  await updateUserRole({ id: userId, role });
  await createAuditLogEntry({
    actorId: actor.id,
    action: "user.role.update",
    target: { userId },
    metadata: { role },
  });

  revalidatePath("/admin/users");
}

export async function setUserActiveStateAction({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const actor = await requireAdmin();

  await updateUserActiveState({ id: userId, isActive });
  await createAuditLogEntry({
    actorId: actor.id,
    action: "user.active.update",
    target: { userId },
    metadata: { isActive },
  });

  revalidatePath("/admin/users");
}

export async function setUserPersonalKnowledgePermissionAction({
  userId,
  allowed,
}: {
  userId: string;
  allowed: boolean;
}) {
  const actor = await requireAdmin();

  await updateUserPersonalKnowledgePermission({
    id: userId,
    allowPersonalKnowledge: allowed,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "user.personal_knowledge.toggle",
    target: { userId },
    metadata: { allowed },
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/rag");
  revalidatePath("/profile");
}

export async function deleteChatAction({ chatId }: { chatId: string }) {
  const actor = await requireAdmin();

  await deleteChatById({ id: chatId });
  await createAuditLogEntry({
    actorId: actor.id,
    action: "chat.delete",
    target: { chatId },
  });

  revalidatePath("/admin/chats");
}

export async function hardDeleteChatAction({ chatId }: { chatId: string }) {
  const actor = await requireAdmin();

  await hardDeleteChatById({ id: chatId });
  await createAuditLogEntry({
    actorId: actor.id,
    action: "chat.hard_delete",
    target: { chatId },
  });

  revalidatePath("/admin/chats");
}

export async function restoreChatAction({ chatId }: { chatId: string }) {
  const actor = await requireAdmin();

  await restoreChatById({ id: chatId });
  await createAuditLogEntry({
    actorId: actor.id,
    action: "chat.restore",
    target: { chatId },
  });

  revalidatePath("/admin/chats");
}

export async function updateForumAvailabilityAction(formData: FormData) {
  "use server";
  const actor = await withTimeout(
    requireAdmin(),
    FEATURE_ACCESS_SETTING_TIMEOUT_MS
  );

  await updateFeatureAccessModeSetting({
    actorId: actor.id,
    auditAction: "forum.toggle",
    fallbackMode: "enabled",
    fieldName: "forumAccessMode",
    formData,
    settingKey: FORUM_FEATURE_FLAG_KEY,
  });
}

export async function updateCalculatorAvailabilityAction(formData: FormData) {
  "use server";
  const actor = await withTimeout(
    requireAdmin(),
    FEATURE_ACCESS_SETTING_TIMEOUT_MS
  );

  await updateFeatureAccessModeSetting({
    actorId: actor.id,
    auditAction: "feature.calculator.toggle",
    fallbackMode: "enabled",
    fieldName: "calculatorAccessMode",
    formData,
    settingKey: CALCULATOR_FEATURE_FLAG_KEY,
  });
}

export async function updateStudyModeAvailabilityAction(formData: FormData) {
  "use server";
  const actor = await withTimeout(
    requireAdmin(),
    FEATURE_ACCESS_SETTING_TIMEOUT_MS
  );

  await updateFeatureAccessModeSetting({
    actorId: actor.id,
    auditAction: "feature.study_mode.toggle",
    fallbackMode: "disabled",
    fieldName: "studyModeAccessMode",
    formData,
    settingKey: STUDY_MODE_FEATURE_FLAG_KEY,
  });
}

export async function updateImageGenerationAvailabilityAction(
  formData: FormData
) {
  "use server";
  const actor = await withTimeout(
    requireAdmin(),
    FEATURE_ACCESS_SETTING_TIMEOUT_MS
  );

  await updateFeatureAccessModeSetting({
    actorId: actor.id,
    auditAction: "feature.image_generation.toggle",
    fallbackMode: "disabled",
    fieldName: "imageGenerationAccessMode",
    formData,
    settingKey: IMAGE_GENERATION_FEATURE_FLAG_KEY,
  });
}

export async function updateDocumentUploadsAvailabilityAction(
  formData: FormData
) {
  "use server";
  const actor = await withTimeout(
    requireAdmin(),
    FEATURE_ACCESS_SETTING_TIMEOUT_MS
  );

  await updateFeatureAccessModeSetting({
    actorId: actor.id,
    auditAction: "feature.document_uploads.toggle",
    fallbackMode: "disabled",
    fieldName: "documentUploadsAccessMode",
    formData,
    settingKey: DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  });
}

export async function updateIconPromptAvailabilityAction(formData: FormData) {
  "use server";
  const actor = await withTimeout(
    requireAdmin(),
    FEATURE_ACCESS_SETTING_TIMEOUT_MS
  );

  await updateFeatureAccessModeSetting({
    actorId: actor.id,
    auditAction: "feature.icon_prompts.toggle",
    fallbackMode: "disabled",
    fieldName: "iconPromptsAccessMode",
    formData,
    settingKey: ICON_PROMPTS_ENABLED_SETTING_KEY,
  });
}

export async function updateSuggestedPromptsAvailabilityAction(
  formData: FormData
) {
  "use server";
  const actor = await withTimeout(
    requireAdmin(),
    FEATURE_ACCESS_SETTING_TIMEOUT_MS
  );

  await updateFeatureAccessModeSetting({
    actorId: actor.id,
    auditAction: "feature.suggested_prompts.toggle",
    fallbackMode: "enabled",
    fieldName: "suggestedPromptsAccessMode",
    formData,
    settingKey: SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  });
}

export async function updateComingSoonContentAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const content = sanitizeComingSoonContentInput({
    eyebrow: formData.get("comingSoonEyebrow"),
    title: formData.get("comingSoonTitle"),
  });

  await setAppSetting({
    key: SITE_COMING_SOON_CONTENT_SETTING_KEY,
    value: content,
  });
  revalidateAppSettingCache(SITE_COMING_SOON_CONTENT_SETTING_KEY);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "site.coming_soon_content.update",
    target: { setting: SITE_COMING_SOON_CONTENT_SETTING_KEY },
    metadata: content,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/coming-soon");
}

export async function updateComingSoonTimerAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const timerSetting = sanitizeComingSoonTimerInput({
    label: formData.get("comingSoonTimerLabel"),
    mode: formData.get("comingSoonTimerMode"),
    referenceAt: formData.get("comingSoonTimerReferenceAt"),
  });

  await setAppSetting({
    key: SITE_COMING_SOON_TIMER_SETTING_KEY,
    value: timerSetting,
  });
  revalidateAppSettingCache(SITE_COMING_SOON_TIMER_SETTING_KEY);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "site.coming_soon_timer.update",
    target: { setting: SITE_COMING_SOON_TIMER_SETTING_KEY },
    metadata: timerSetting,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/coming-soon");
}

export async function createPrelaunchInviteAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const inviteLabel = formData.get("inviteLabel");
  const label =
    typeof inviteLabel === "string" && inviteLabel.trim().length > 0
      ? inviteLabel
      : null;

  const invite = await createPrelaunchInviteToken({
    createdByAdminId: actor.id,
    label,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "site.prelaunch_invite.create",
    target: { inviteId: invite.id },
    metadata: {
      inviteLabel: invite.label,
    },
  });

  revalidatePath("/admin/settings");
}

export async function revokePrelaunchInviteAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const inviteId = formData.get("inviteId");
  const normalizedInviteId =
    typeof inviteId === "string" ? inviteId.trim() : "";

  if (!normalizedInviteId) {
    throw new Error("Invite id is required");
  }

  const revoked = await revokePrelaunchInviteToken({
    inviteId: normalizedInviteId,
    revokedByAdminId: actor.id,
  });

  if (revoked) {
    await createAuditLogEntry({
      actorId: actor.id,
      action: "site.prelaunch_invite.revoke",
      target: { inviteId: normalizedInviteId },
    });
  }

  revalidatePath("/admin/settings");
}

export async function revokePrelaunchInviteAccessAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const userId = formData.get("userId");
  const inviteId = formData.get("inviteId");
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  const normalizedInviteId = typeof inviteId === "string" ? inviteId.trim() : "";

  if (!normalizedUserId) {
    throw new Error("User id is required");
  }

  const revoked = await revokePrelaunchInviteAccessForUser({
    userId: normalizedUserId,
    inviteId: normalizedInviteId || null,
    revokedByAdminId: actor.id,
  });

  if (revoked) {
    await createAuditLogEntry({
      actorId: actor.id,
      action: "site.prelaunch_invite_access.revoke",
      target: {
        userId: normalizedUserId,
        inviteId: normalizedInviteId || null,
      },
    });
  }

  revalidatePath("/admin/settings");
}

export async function updateImageFilenamePrefixAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const rawPrefix = formData.get("imageFilenamePrefix");
  const prefix =
    typeof rawPrefix === "string" ? rawPrefix.trim() : "";

  await setAppSetting({
    key: IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY,
    value: prefix,
  });
  revalidateAppSettingCache(IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "feature.image_generation.filename_prefix",
    target: { setting: IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY },
    metadata: { prefix },
  });

  revalidatePath("/admin/settings");
}

export async function updateCustomKnowledgeSettingsAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const enabled = parseBoolean(formData.get("customKnowledgeEnabled"));
  await setAppSetting({
    key: CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
    value: enabled,
  });
  revalidateAppSettingCache(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "settings.custom_knowledge.update",
    target: { setting: CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY },
    metadata: { enabled },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/rag");
}

export async function rebuildRagFileSearchIndexAction() {
  "use server";
  await requireAdmin();
  await rebuildAllRagFileSearchIndexes();
  revalidatePath("/admin/rag");
}

function parseBoolean(value: FormDataEntryValue | null | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.toString().toLowerCase();
  return normalized === "true" || normalized === "on" || normalized === "1";
}

function parseBooleanFromEntries(formData: FormData, key: string) {
  const entries = formData.getAll(key);
  if (entries.length === 0) {
    return null;
  }
  return entries.some((entry) => parseBoolean(entry));
}

function parseJson(value: FormDataEntryValue | null | undefined) {
  if (!value) {
    return null;
  }

  const text = value.toString().trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON provided for model configuration");
  }
}

function parseNumber(value: FormDataEntryValue | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  const normalized = value.toString().trim();
  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCreditsToTokens(value: FormDataEntryValue | null | undefined) {
  const credits = parseNumber(value);
  const tokens = Math.round(credits * TOKENS_PER_CREDIT);
  return Math.max(1, tokens);
}

function parseCurrencyToPaise(value: FormDataEntryValue | null | undefined) {
  const amount = parseNumber(value);
  return Math.max(0, Math.round(amount * 100));
}

async function resolveImageModelPricing(formData: FormData) {
  const priceInPaise = parseCurrencyToPaise(formData.get("priceInRupees"));
  const creditsFallback = parseCreditsToTokens(
    formData.get("creditsPerImage")
  );

  if (!priceInPaise) {
    return { tokensPerImage: creditsFallback, priceInPaise: 0 };
  }

  const recommendedPlanId = await getAppSetting<string | null>(
    RECOMMENDED_PRICING_PLAN_SETTING_KEY
  );

  if (!recommendedPlanId) {
    return { tokensPerImage: creditsFallback, priceInPaise };
  }

  const plan = await getPricingPlanById({ id: recommendedPlanId });
  const planPriceInPaise = plan?.priceInPaise ?? 0;
  const planTokenAllowance = plan?.tokenAllowance ?? 0;

  if (planPriceInPaise <= 0 || planTokenAllowance <= 0) {
    return { tokensPerImage: creditsFallback, priceInPaise };
  }

  const pricePerTokenPaise = planPriceInPaise / planTokenAllowance;
  const tokensPerImage = Math.max(
    1,
    Math.ceil(priceInPaise / pricePerTokenPaise)
  );

  return { tokensPerImage, priceInPaise };
}

function parseDateInput(value: FormDataEntryValue | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = value.toString().trim();
  if (!normalized) {
    return null;
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

const IST_OFFSET_MINUTES = 330;
const LANGUAGE_CODE_REGEX = /^[a-z0-9-]{2,16}$/i;
const PROMPTS_SPLIT_REGEX = /\r?\n/;

type TimeParts = {
  hours: number;
  minutes: number;
  seconds: number;
  ms: number;
};

function convertIstDateToUtc(date: Date, time: TimeParts) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const istTimestamp = Date.UTC(
    year,
    month,
    day,
    time.hours,
    time.minutes,
    time.seconds,
    time.ms
  );
  return new Date(istTimestamp - IST_OFFSET_MINUTES * 60 * 1000);
}

function normalizeStartOfDayIst(date: Date) {
  return convertIstDateToUtc(date, {
    hours: 0,
    minutes: 0,
    seconds: 0,
    ms: 0,
  });
}

function normalizeEndOfDayIst(date: Date) {
  return convertIstDateToUtc(date, {
    hours: 23,
    minutes: 59,
    seconds: 59,
    ms: 999,
  });
}

export async function upsertCouponAction(formData: FormData) {
  const actor = await requireAdmin();

  const couponIdRaw = formData.get("couponId");
  const code = formData.get("code")?.toString().trim() ?? "";
  const discountPercentage = parseNumber(formData.get("discountPercentage"));
  const creatorRewardPercentage = parseNumber(
    formData.get("creatorRewardPercentage")
  );
  const creatorId = formData.get("creatorId")?.toString().trim() ?? "";
  const validFromRaw = parseDateInput(formData.get("validFrom"));
  const validToRaw = parseDateInput(formData.get("validTo"));
  const description = formData.get("description")?.toString().trim() ?? null;
  const isActive = parseBoolean(formData.get("isActive"));

  if (!code || !creatorId || !validFromRaw) {
    throw new Error("Coupon code, creator, and start date are required");
  }

  if (validToRaw && validToRaw < validFromRaw) {
    throw new Error("Valid until date must be after the start date");
  }

  const validFrom = normalizeStartOfDayIst(validFromRaw);
  const validTo = validToRaw ? normalizeEndOfDayIst(validToRaw) : null;

  const couponRecord = await upsertCoupon({
    id: couponIdRaw?.toString().trim() || undefined,
    code,
    discountPercentage,
    creatorRewardPercentage,
    creatorId,
    validFrom,
    validTo,
    description,
    isActive,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: couponIdRaw ? "coupon.update" : "coupon.create",
    target: { couponId: couponRecord.id },
    metadata: {
      code: couponRecord.code,
      creatorId,
      discountPercentage,
      creatorRewardPercentage: couponRecord.creatorRewardPercentage,
    },
  });

  revalidatePath("/admin/coupons");
  revalidatePath("/recharge");
}

export async function setCouponStatusAction(formData: FormData) {
  const actor = await requireAdmin();
  const couponId = formData.get("couponId")?.toString().trim();
  const isActive = parseBoolean(formData.get("isActive"));

  if (!couponId) {
    throw new Error("Coupon id is required");
  }

  await setCouponStatus({
    id: couponId,
    isActive,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "coupon.status.update",
    target: { couponId },
    metadata: { isActive },
  });

  revalidatePath("/admin/coupons");
  revalidatePath("/recharge");
}

export async function setCouponRewardStatusAction(formData: FormData) {
  const actor = await requireAdmin();
  const couponId = formData.get("couponId")?.toString().trim();
  const rewardStatusRaw = formData.get("rewardStatus")?.toString().trim() ?? "";
  const usageCount = parseNumber(formData.get("usageCount"));

  if (!couponId) {
    throw new Error("Coupon id is required");
  }

  if (usageCount <= 0) {
    throw new Error("Cannot update reward status before any redemptions");
  }

  const normalizedStatus = rewardStatusRaw === "paid" ? "paid" : "pending";

  await setCouponRewardStatus({
    id: couponId,
    rewardStatus: normalizedStatus,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "coupon.reward_status.update",
    target: { couponId },
    metadata: { rewardStatus: normalizedStatus },
  });

  revalidatePath("/admin/coupons");
  revalidatePath("/recharge");
}

export async function recordCouponPayoutAction(formData: FormData) {
  const actor = await requireAdmin();

  const couponId = formData.get("couponId")?.toString().trim() ?? "";
  const amount = parseNumber(formData.get("amount"));
  const note = formData.get("note")?.toString().trim() ?? null;

  if (!couponId) {
    throw new Error("Coupon id is required");
  }

  if (!(Number.isFinite(amount) && amount > 0)) {
    throw new Error("Payout amount must be greater than zero");
  }

  const amountInPaise = Math.round(amount * 100);

  await recordCouponRewardPayout({
    couponId,
    amountInPaise,
    note,
    recordedBy: actor.id,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "coupon.reward.payout",
    target: { couponId },
    metadata: { amountInPaise, note },
  });

  revalidatePath("/admin/coupons");
  revalidatePath("/creator-dashboard");
}

function isRedirectErrorLike(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;");
}

export async function createModelConfigAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const key = formData.get("key")?.toString().trim();
  const provider = formData.get("provider")?.toString().trim();
  const providerModelId = formData.get("providerModelId")?.toString().trim();
  const displayName = formData.get("displayName")?.toString().trim();

  if (!key || !provider || !providerModelId || !displayName) {
    throw new Error("Missing required model configuration fields");
  }

  const description = formData.get("description")?.toString() ?? "";
  const systemPrompt = formData.get("systemPrompt")?.toString() ?? null;
  const codeTemplate = formData.get("codeTemplate")?.toString() ?? null;
  const reasoningTag = formData.get("reasoningTag")?.toString() ?? null;
  const supportsReasoning = parseBoolean(formData.get("supportsReasoning"));
  const isEnabled = parseBoolean(formData.get("isEnabled"));
  const isDefault = parseBoolean(formData.get("isDefault"));
  const isMarginBaseline = parseBoolean(formData.get("isMarginBaseline"));
  const config = parseJson(formData.get("configJson"));
  const inputProviderCostPerMillion = parseNumber(
    formData.get("inputProviderCostPerMillion")
  );
  const outputProviderCostPerMillion = parseNumber(
    formData.get("outputProviderCostPerMillion")
  );
  const freeMessagesRaw = formData.get("freeMessagesPerDay");
  const resolvedFreeMessages =
    freeMessagesRaw === null
      ? DEFAULT_FREE_MESSAGES_PER_DAY
      : parseNumber(freeMessagesRaw);
  const freeMessagesPerDay = Math.max(0, Math.round(resolvedFreeMessages));

  const existingConfig = await getModelConfigByKey({
    key,
    includeDeleted: true,
  });

  if (existingConfig) {
    if (existingConfig.deletedAt) {
      redirect("/admin/settings?notice=model-key-soft-deleted");
    } else {
      redirect("/admin/settings?notice=model-key-conflict");
    }
  }

  let created: Awaited<ReturnType<typeof createModelConfig>>;
  try {
    created = await createModelConfig({
      key,
      provider: provider as any,
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
      inputProviderCostPerMillion,
      outputProviderCostPerMillion,
      freeMessagesPerDay,
    });
  } catch (error) {
    console.error("Failed to create model configuration", error);
    redirect("/admin/settings?notice=model-create-error");
  }

  await createAuditLogEntry({
    actorId: actor.id,
    action: "model.create",
    target: { modelId: created.id },
    metadata: { key, provider, providerModelId },
  });

  revalidateTag(MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/chat", "layout");
  revalidatePath("/chat");
  revalidatePath("/", "layout");

  redirect("/admin/settings?notice=model-created");
}

export async function updateModelConfigAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const id = formData.get("id")?.toString();
  if (!id) {
    throw new Error("Missing model configuration id");
  }

  const patch: {
    provider?: any;
    providerModelId?: string;
    displayName?: string;
    description?: string | null;
    systemPrompt?: string | null;
    codeTemplate?: string | null;
    reasoningTag?: string | null;
    supportsReasoning?: boolean;
    config?: Record<string, unknown> | null;
    isEnabled?: boolean;
    isDefault?: boolean;
    inputProviderCostPerMillion?: number;
    outputProviderCostPerMillion?: number;
    freeMessagesPerDay?: number;
  } = {};

  const provider = formData.get("provider");
  if (provider) {
    patch.provider = provider.toString();
  }

  const providerModelId = formData.get("providerModelId");
  if (providerModelId) {
    patch.providerModelId = providerModelId.toString();
  }

  const displayName = formData.get("displayName");
  if (displayName) {
    patch.displayName = displayName.toString();
  }

  if (formData.has("description")) {
    patch.description = formData.get("description")?.toString() ?? "";
  }

  if (formData.has("systemPrompt")) {
    patch.systemPrompt = formData.get("systemPrompt")?.toString() ?? null;
  }

  if (formData.has("codeTemplate")) {
    patch.codeTemplate = formData.get("codeTemplate")?.toString() ?? null;
  }

  if (formData.has("reasoningTag")) {
    patch.reasoningTag = formData.get("reasoningTag")?.toString() ?? null;
  }

  if (formData.has("configJson")) {
    patch.config = parseJson(formData.get("configJson"));
  }

  const supportsReasoningValue = parseBooleanFromEntries(
    formData,
    "supportsReasoning"
  );
  if (supportsReasoningValue !== null) {
    patch.supportsReasoning = supportsReasoningValue;
  }

  const isEnabledValue = parseBooleanFromEntries(formData, "isEnabled");
  if (isEnabledValue !== null) {
    patch.isEnabled = isEnabledValue;
  }

  const isDefaultValue = parseBooleanFromEntries(formData, "isDefault");
  if (isDefaultValue !== null) {
    patch.isDefault = isDefaultValue;
  }

  if (formData.has("inputProviderCostPerMillion")) {
    patch.inputProviderCostPerMillion = parseNumber(
      formData.get("inputProviderCostPerMillion")
    );
  }

  if (formData.has("outputProviderCostPerMillion")) {
    patch.outputProviderCostPerMillion = parseNumber(
      formData.get("outputProviderCostPerMillion")
    );
  }

  if (formData.has("freeMessagesPerDay")) {
    patch.freeMessagesPerDay = Math.max(
      0,
      Math.round(parseNumber(formData.get("freeMessagesPerDay")))
    );
  }

  await updateModelConfig({
    id,
    ...patch,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "model.update",
    target: { modelId: id },
    metadata: patch,
  });

  revalidateTag(MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/chat", "layout");
  revalidatePath("/chat");
  revalidatePath("/", "layout");
}

export async function deleteModelConfigAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const id = formData.get("id")?.toString();

  if (!id) {
    throw new Error("Missing model configuration id");
  }

  await deleteModelConfig(id);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "model.delete",
    target: { modelId: id },
  });

  revalidateTag(MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/chat", "layout");
  revalidatePath("/chat");
  revalidatePath("/", "layout");

  redirect("/admin/settings?notice=model-deleted");
}

export async function hardDeleteModelConfigAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const id = formData.get("id")?.toString();

  if (!id) {
    throw new Error("Missing model configuration id");
  }

  await hardDeleteModelConfig(id);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "model.hard_delete",
    target: { modelId: id },
  });

  revalidateTag(MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/chat", "layout");
  revalidatePath("/chat");
  revalidatePath("/", "layout");

  redirect("/admin/settings?notice=model-hard-deleted");
}

export async function setDefaultModelConfigAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const id = formData.get("id")?.toString();

  if (!id) {
    throw new Error("Missing model configuration id");
  }

  await setDefaultModelConfig(id);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "model.setDefault",
    target: { modelId: id },
  });

  revalidateTag(MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/chat", "layout");
  revalidatePath("/chat");
  revalidatePath("/", "layout");

  redirect("/admin/settings?notice=model-defaulted");
}

export async function setMarginBaselineModelAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const id = formData.get("id")?.toString();

  if (!id) {
    throw new Error("Missing model configuration id");
  }

  await setMarginBaselineModel(id);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "model.setMarginBaseline",
    target: { modelId: id },
  });

  revalidateTag(MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/chat", "layout");
  revalidatePath("/chat");
  revalidatePath("/", "layout");

  redirect("/admin/settings?notice=model-margin-baseline");
}

export async function createImageModelConfigAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const key = formData.get("key")?.toString().trim();
  const provider = formData.get("provider")?.toString().trim();
  const providerModelId = formData.get("providerModelId")?.toString().trim();
  const displayName = formData.get("displayName")?.toString().trim();

  if (!key || !provider || !providerModelId || !displayName) {
    throw new Error("Missing required image model configuration fields");
  }

  const description = formData.get("description")?.toString() ?? "";
  const config = parseJson(formData.get("configJson"));
  const isEnabled = parseBoolean(formData.get("isEnabled"));
  const isActive = parseBoolean(formData.get("isActive"));
  const pricing = await resolveImageModelPricing(formData);

  const existingConfig = await getImageModelConfigByKey({
    key,
    includeDeleted: true,
  });

  if (existingConfig) {
    if (existingConfig.deletedAt) {
      redirect("/admin/settings?notice=image-model-key-soft-deleted");
    } else {
      redirect("/admin/settings?notice=image-model-key-conflict");
    }
  }

  let created: Awaited<ReturnType<typeof createImageModelConfig>>;
  try {
    created = await createImageModelConfig({
      key,
      provider: provider as any,
      providerModelId,
      displayName,
      description,
      config,
      priceInPaise: pricing.priceInPaise,
      tokensPerImage: pricing.tokensPerImage,
      isEnabled,
      isActive,
    });
  } catch (error) {
    console.error("Failed to create image model configuration", error);
    redirect("/admin/settings?notice=image-model-create-error");
  }

  await createAuditLogEntry({
    actorId: actor.id,
    action: "image_model.create",
    target: { imageModelId: created.id },
    metadata: { key, provider, providerModelId },
  });

  revalidateTag(IMAGE_MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function updateImageModelConfigAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const id = formData.get("id")?.toString();
  if (!id) {
    throw new Error("Missing image model configuration id");
  }

  const patch: {
    provider?: any;
    providerModelId?: string;
    displayName?: string;
    description?: string | null;
    config?: Record<string, unknown> | null;
    priceInPaise?: number;
    tokensPerImage?: number;
    isEnabled?: boolean;
  } = {};

  const provider = formData.get("provider");
  if (provider) {
    patch.provider = provider.toString();
  }

  const providerModelId = formData.get("providerModelId");
  if (providerModelId) {
    patch.providerModelId = providerModelId.toString();
  }

  const displayName = formData.get("displayName");
  if (displayName) {
    patch.displayName = displayName.toString();
  }

  if (formData.has("description")) {
    patch.description = formData.get("description")?.toString() ?? "";
  }

  if (formData.has("configJson")) {
    patch.config = parseJson(formData.get("configJson"));
  }

  if (formData.has("creditsPerImage") || formData.has("priceInRupees")) {
    const pricing = await resolveImageModelPricing(formData);
    patch.tokensPerImage = pricing.tokensPerImage;
    patch.priceInPaise = pricing.priceInPaise;
  }

  const isEnabledValue = parseBooleanFromEntries(formData, "isEnabled");
  if (isEnabledValue !== null) {
    patch.isEnabled = isEnabledValue;
  }

  await updateImageModelConfig({
    id,
    ...patch,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "image_model.update",
    target: { imageModelId: id },
    metadata: patch,
  });

  revalidateTag(IMAGE_MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function deleteImageModelConfigAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const id = formData.get("id")?.toString();

  if (!id) {
    throw new Error("Missing image model configuration id");
  }

  await deleteImageModelConfig(id);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "image_model.delete",
    target: { imageModelId: id },
  });

  revalidateTag(IMAGE_MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");

  redirect("/admin/settings?notice=image-model-deleted");
}

export async function hardDeleteImageModelConfigAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const id = formData.get("id")?.toString();

  if (!id) {
    throw new Error("Missing image model configuration id");
  }

  await hardDeleteImageModelConfig(id);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "image_model.hard_delete",
    target: { imageModelId: id },
  });

  revalidateTag(IMAGE_MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");

  redirect("/admin/settings?notice=image-model-hard-deleted");
}

export async function setActiveImageModelConfigAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const id = formData.get("id")?.toString();

  if (!id) {
    throw new Error("Missing image model configuration id");
  }

  await setActiveImageModelConfig(id);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "image_model.setActive",
    target: { imageModelId: id },
  });

  revalidateTag(IMAGE_MODEL_REGISTRY_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");

  redirect("/admin/settings?notice=image-model-activated");
}

export async function setImagePromptTranslationModelAction(
  formData: FormData
) {
  "use server";
  const actor = await requireAdmin();
  const modelId = formData.get("modelId");
  const normalizedModelId =
    typeof modelId === "string" && modelId.trim().length > 0
      ? modelId.trim()
      : null;

  if (normalizedModelId) {
    const model = await getModelConfigById({ id: normalizedModelId });
    if (!model || !model.isEnabled) {
      redirect("/admin/settings?notice=image-translation-model-invalid");
    }
  }

  await setAppSetting({
    key: IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY,
    value: normalizedModelId,
  });
  revalidateAppSettingCache(IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "image_prompt_translation_model.update",
    target: { setting: IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY },
    metadata: { modelId: normalizedModelId },
  });

  revalidatePath("/admin/settings");

  redirect("/admin/settings?notice=image-translation-model-updated");
}

export async function updatePrivacyPolicyAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const content = formData.get("content")?.toString().trim() ?? "";

  await setAppSetting({ key: "privacyPolicy", value: content });
  revalidateAppSettingCache("privacyPolicy");

  await createAuditLogEntry({
    actorId: actor.id,
    action: "legal.privacy.update",
    target: { document: "privacyPolicy" },
  });

  revalidatePath("/privacy-policy");
  revalidatePath("/admin/settings");

  redirect("/admin/settings?notice=privacy-updated");
}

export async function updateTermsOfServiceAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const content = formData.get("content")?.toString().trim() ?? "";

  await setAppSetting({ key: "termsOfService", value: content });
  revalidateAppSettingCache("termsOfService");

  await createAuditLogEntry({
    actorId: actor.id,
    action: "legal.terms.update",
    target: { document: "termsOfService" },
  });

  revalidatePath("/terms-of-service");
  revalidatePath("/admin/settings");

  redirect("/admin/settings?notice=terms-updated");
}

export async function updateAboutContentAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const requestedLanguageCode =
    formData.get("languageCode")?.toString().trim().toLowerCase() ?? "";
  const language =
    requestedLanguageCode.length > 0
      ? await getLanguageByCode(requestedLanguageCode)
      : await getDefaultLanguage();

  if (!language) {
    throw new Error("Selected language is not available");
  }

  if (!language.isActive && !language.isDefault) {
    throw new Error("Selected language is not available");
  }

  const content = formData.get("content")?.toString().trim() ?? "";

  if (!content) {
    throw new Error("About content cannot be empty");
  }

  const existingByLanguage = await getAppSetting<unknown>(
    "aboutUsContentByLanguage"
  );
  const aboutContentByLanguage: Record<string, string> = {};

  if (
    existingByLanguage &&
    typeof existingByLanguage === "object" &&
    !Array.isArray(existingByLanguage)
  ) {
    for (const [code, value] of Object.entries(
      existingByLanguage as Record<string, unknown>
    )) {
      if (typeof value === "string" && value.trim().length > 0) {
        aboutContentByLanguage[code] = value.trim();
      }
    }
  }

  aboutContentByLanguage[language.code] = content;

  await setAppSetting({
    key: "aboutUsContentByLanguage",
    value: aboutContentByLanguage,
  });
  revalidateAppSettingCache("aboutUsContentByLanguage");

  if (language.isDefault) {
    await setAppSetting({ key: "aboutUsContent", value: content });
    revalidateAppSettingCache("aboutUsContent");
  }

  await createAuditLogEntry({
    actorId: actor.id,
    action: "company.about.update",
    target: { document: "aboutUsContent" },
    metadata: { language: language.code },
  });

  revalidatePath("/about");
  revalidatePath("/admin/settings");

  return {
    success: true as const,
    languageCode: language.code,
  };
}

export async function updatePrivacyPolicyByLanguageAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const requestedLanguageCode =
    formData.get("languageCode")?.toString().trim().toLowerCase() ?? "";
  const language =
    requestedLanguageCode.length > 0
      ? await getLanguageByCode(requestedLanguageCode)
      : await getDefaultLanguage();

  if (!language) {
    throw new Error("Selected language is not available");
  }

  if (!language.isActive && !language.isDefault) {
    throw new Error("Selected language is not available");
  }

  const content = formData.get("content")?.toString().trim() ?? "";

  if (!content) {
    throw new Error("Privacy policy content cannot be empty");
  }

  const existingByLanguage = await getAppSetting<unknown>(
    "privacyPolicyByLanguage"
  );
  const privacyContentByLanguage: Record<string, string> = {};

  if (
    existingByLanguage &&
    typeof existingByLanguage === "object" &&
    !Array.isArray(existingByLanguage)
  ) {
    for (const [code, value] of Object.entries(
      existingByLanguage as Record<string, unknown>
    )) {
      if (typeof value === "string" && value.trim().length > 0) {
        privacyContentByLanguage[code] = value.trim();
      }
    }
  }

  privacyContentByLanguage[language.code] = content;

  await setAppSetting({
    key: "privacyPolicyByLanguage",
    value: privacyContentByLanguage,
  });
  revalidateAppSettingCache("privacyPolicyByLanguage");

  if (language.isDefault) {
    await setAppSetting({ key: "privacyPolicy", value: content });
    revalidateAppSettingCache("privacyPolicy");
  }

  await createAuditLogEntry({
    actorId: actor.id,
    action: "legal.privacy.update",
    target: { document: "privacyPolicy" },
    metadata: { language: language.code },
  });

  revalidatePath("/privacy-policy");
  revalidatePath("/admin/settings");

  return {
    success: true as const,
    languageCode: language.code,
  };
}

export async function updateTermsOfServiceByLanguageAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const requestedLanguageCode =
    formData.get("languageCode")?.toString().trim().toLowerCase() ?? "";
  const language =
    requestedLanguageCode.length > 0
      ? await getLanguageByCode(requestedLanguageCode)
      : await getDefaultLanguage();

  if (!language) {
    throw new Error("Selected language is not available");
  }

  if (!language.isActive && !language.isDefault) {
    throw new Error("Selected language is not available");
  }

  const content = formData.get("content")?.toString().trim() ?? "";

  if (!content) {
    throw new Error("Terms of service content cannot be empty");
  }

  const existingByLanguage = await getAppSetting<unknown>(
    "termsOfServiceByLanguage"
  );
  const termsContentByLanguage: Record<string, string> = {};

  if (
    existingByLanguage &&
    typeof existingByLanguage === "object" &&
    !Array.isArray(existingByLanguage)
  ) {
    for (const [code, value] of Object.entries(
      existingByLanguage as Record<string, unknown>
    )) {
      if (typeof value === "string" && value.trim().length > 0) {
        termsContentByLanguage[code] = value.trim();
      }
    }
  }

  termsContentByLanguage[language.code] = content;

  await setAppSetting({
    key: "termsOfServiceByLanguage",
    value: termsContentByLanguage,
  });
  revalidateAppSettingCache("termsOfServiceByLanguage");

  if (language.isDefault) {
    await setAppSetting({ key: "termsOfService", value: content });
    revalidateAppSettingCache("termsOfService");
  }

  await createAuditLogEntry({
    actorId: actor.id,
    action: "legal.terms.update",
    target: { document: "termsOfService" },
    metadata: { language: language.code },
  });

  revalidatePath("/terms-of-service");
  revalidatePath("/admin/settings");

  return {
    success: true as const,
    languageCode: language.code,
  };
}

export async function createLanguageAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const code = formData.get("code")?.toString().trim() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const isActive = parseBoolean(formData.get("isActive") ?? "on");
  const syncUiLanguage = parseBoolean(formData.get("syncUiLanguage"));
  const systemPrompt = formData.get("systemPrompt")?.toString() ?? "";

  const normalizedCode = code.toLowerCase();

  if (!normalizedCode || !name) {
    redirect("/admin/settings?notice=language-create-error");
  }

  if (!LANGUAGE_CODE_REGEX.test(normalizedCode)) {
    redirect("/admin/settings?notice=language-code-invalid");
  }

  try {
    await createLanguageEntry({
      code: normalizedCode,
      name,
      isDefault: false,
      isActive,
      syncUiLanguage,
      systemPrompt,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      redirect("/admin/settings?notice=language-create-duplicate");
    }
    console.error("Failed to create language", error);
    redirect("/admin/settings?notice=language-create-error");
  }

  await createAuditLogEntry({
    actorId: actor.id,
    action: "translation.language.create",
    target: { languageCode: normalizedCode },
    metadata: {
      name,
      isActive,
      syncUiLanguage,
      systemPrompt: systemPrompt.trim() || null,
    },
  });

  await invalidateTranslationBundleCache();

  revalidateTag("languages");
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/translations");

  redirect("/admin/settings?notice=language-created");
}

export async function updateLanguageStatusAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const languageId = formData.get("languageId")?.toString().trim();
  const intent = formData.get("intent")?.toString().trim();

  if (!languageId || !intent) {
    redirect("/admin/settings?notice=language-update-error");
  }

  const targetLanguage = await getLanguageByIdRaw(languageId);

  if (!targetLanguage) {
    redirect("/admin/settings?notice=language-update-error");
  }

  const shouldActivate = intent === "activate";
  if (intent !== "activate" && intent !== "deactivate") {
    redirect("/admin/settings?notice=language-update-error");
  }

  if (targetLanguage.isDefault && !shouldActivate) {
    redirect("/admin/settings?notice=language-default-inactive");
  }

  if (targetLanguage.isActive === shouldActivate) {
    redirect("/admin/settings?notice=language-updated");
  }

  await updateLanguageActiveState({
    id: targetLanguage.id,
    isActive: shouldActivate,
  });

  await invalidateTranslationBundleCache();

  await createAuditLogEntry({
    actorId: actor.id,
    action: "translation.language.toggle",
    target: { languageCode: targetLanguage.code },
    metadata: { isActive: shouldActivate },
  });

  revalidateTag("languages");
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/translations");

  redirect("/admin/settings?notice=language-updated");
}

export async function updateLanguageSettingsAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const languageId = formData.get("languageId")?.toString().trim();
  const name = formData.get("name")?.toString().trim() ?? "";
  const systemPrompt = formData.get("systemPrompt")?.toString() ?? "";
  const syncUiLanguage = parseBoolean(formData.get("syncUiLanguage"));

  if (!languageId || !name) {
    redirect("/admin/settings?notice=language-settings-error");
  }

  if (name.length > 64) {
    redirect("/admin/settings?notice=language-settings-error");
  }

  const targetLanguage = await getLanguageByIdRaw(languageId);
  if (!targetLanguage) {
    redirect("/admin/settings?notice=language-settings-error");
  }

  const normalizedPrompt =
    systemPrompt.trim().length > 0 ? systemPrompt.trim() : null;

  await updateLanguageDetails({
    id: targetLanguage.id,
    name,
    systemPrompt: normalizedPrompt,
    syncUiLanguage,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "translation.language.update",
    target: { languageCode: targetLanguage.code },
    metadata: {
      name,
      syncUiLanguage,
      systemPrompt: normalizedPrompt,
    },
  });

  await invalidateTranslationBundleCache();

  revalidateTag("languages");
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");

  redirect("/admin/settings?notice=language-settings-updated");
}

export async function deleteLanguageAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const languageId = formData.get("languageId")?.toString().trim();
  if (!languageId) {
    redirect("/admin/settings?notice=language-delete-error");
  }

  const targetLanguage = await getLanguageByIdRaw(languageId);
  if (!targetLanguage) {
    redirect("/admin/settings?notice=language-delete-error");
  }

  if (targetLanguage.isDefault) {
    redirect("/admin/settings?notice=language-default-delete");
  }

  await deleteLanguageById({ id: targetLanguage.id });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "translation.language.delete",
    target: { languageCode: targetLanguage.code },
    metadata: { name: targetLanguage.name },
  });

  await invalidateTranslationBundleCache();

  revalidateTag("languages");
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/translations");

  redirect("/admin/settings?notice=language-deleted");
}

export async function updatePlanTranslationAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const planId = formData.get("planId")?.toString();
  const languageCodeRaw = formData.get("languageCode")?.toString();

  if (!planId || !languageCodeRaw) {
    redirect("/admin/settings?notice=plan-translation-error");
  }

  try {
    const planIdValue = planId.trim();
    const plan = await getPricingPlanById({
      id: planIdValue,
      includeDeleted: true,
    });
    if (!plan) {
      throw new Error("Plan not found");
    }

    const languageCode = languageCodeRaw.trim().toLowerCase();
    const language =
      languageCode.length > 0 ? await getLanguageByCode(languageCode) : null;

    if (!language) {
      throw new Error("Language not found");
    }

    if (!language.isActive && !language.isDefault) {
      throw new Error("Language is not active");
    }

    const nameInput = formData.get("name")?.toString() ?? "";
    const descriptionInput = formData.get("description")?.toString() ?? "";
    const trimmedName = nameInput.trim();
    const trimmedDescription = descriptionInput.trim();

    const definitions = [
      {
        key: `recharge.plan.${plan.id}.name`,
        defaultText: plan.name,
      },
      {
        key: `recharge.plan.${plan.id}.description`,
        defaultText: plan.description ?? "",
      },
    ];

    await registerTranslationKeys(definitions);

    const [nameKey, descriptionKey] = await Promise.all(
      definitions.map((definition) => getTranslationKeyByKey(definition.key))
    );

    if (!nameKey || !descriptionKey) {
      throw new Error("Failed to load translation keys");
    }

    if (language.isDefault) {
      const updates: {
        name?: string;
        description?: string | null;
      } = {};

      if (trimmedName && trimmedName !== plan.name) {
        updates.name = trimmedName;
      }

      if (trimmedDescription !== (plan.description ?? "")) {
        updates.description = trimmedDescription;
      }

      if (Object.keys(updates).length > 0) {
        await updatePricingPlan({
          id: plan.id,
          updates,
        });

        const refreshedPlan = await getPricingPlanById({
          id: plan.id,
          includeDeleted: true,
        });

        if (refreshedPlan) {
          await registerTranslationKeys([
            {
              key: `recharge.plan.${refreshedPlan.id}.name`,
              defaultText: refreshedPlan.name,
            },
            {
              key: `recharge.plan.${refreshedPlan.id}.description`,
              defaultText: refreshedPlan.description ?? "",
            },
          ]);
        }
      }
    } else {
      if (trimmedName) {
        await upsertTranslationValueEntry({
          translationKeyId: nameKey.id,
          languageId: language.id,
          value: trimmedName,
        });
      } else {
        await deleteTranslationValueEntry({
          translationKeyId: nameKey.id,
          languageId: language.id,
        });
      }

      if (trimmedDescription) {
        await upsertTranslationValueEntry({
          translationKeyId: descriptionKey.id,
          languageId: language.id,
          value: trimmedDescription,
        });
      } else {
        await deleteTranslationValueEntry({
          translationKeyId: descriptionKey.id,
          languageId: language.id,
        });
      }
    }

    await invalidateTranslationBundleCache([language.code]);

    await createAuditLogEntry({
      actorId: actor.id,
      action: "billing.plan.translate",
      target: { planId: plan.id, language: language.code },
      metadata: {
        nameLength: trimmedName.length,
        descriptionLength: trimmedDescription.length,
      },
    });

    revalidateTag(PRICING_PLAN_CACHE_TAG);
    revalidatePath("/admin/settings");
    revalidatePath("/admin/translations");
    revalidatePath("/recharge");

    redirect("/admin/settings?notice=plan-translation-updated");
  } catch (error) {
    if (isRedirectErrorLike(error)) {
      throw error;
    }
    console.error("Failed to update plan translation", error);
    redirect("/admin/settings?notice=plan-translation-error");
  }
}

export async function updateFreeMessageSettingsAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const modeInput = formData.get("mode");
  const requestedMode = modeInput === "global" ? "global" : "per-model";
  const globalLimitRaw = formData.get("globalLimit");
  const resolvedGlobalLimit =
    globalLimitRaw === null
      ? DEFAULT_FREE_MESSAGES_PER_DAY
      : parseNumber(globalLimitRaw);
  const normalized = normalizeFreeMessageSettings({
    mode: requestedMode,
    globalLimit: resolvedGlobalLimit,
  });

  await setAppSetting({
    key: FREE_MESSAGE_SETTINGS_KEY,
    value: normalized,
  });
  revalidateAppSettingCache(FREE_MESSAGE_SETTINGS_KEY);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "settings.update.free_messages",
    target: { key: FREE_MESSAGE_SETTINGS_KEY },
    metadata: normalized,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/chat", "layout");
  revalidatePath("/chat");
  revalidatePath("/", "layout");
}

function parseInteger(value: FormDataEntryValue | null | undefined) {
  return Math.round(parseNumber(value));
}

export async function updateSuggestedPromptsAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const requestedLanguageCode =
    formData.get("languageCode")?.toString().trim().toLowerCase() ?? "";
  const language =
    requestedLanguageCode.length > 0
      ? await getLanguageByCode(requestedLanguageCode)
      : await getDefaultLanguage();

  if (!language || !language.isActive) {
    throw new Error("Selected language is not available");
  }

  const promptsValue = formData.get("prompts")?.toString() ?? "";
  const prompts = promptsValue
    .split(PROMPTS_SPLIT_REGEX)
    .map((prompt) => prompt.trim())
    .filter((prompt) => prompt.length > 0);

  if (!prompts.length) {
    throw new Error("At least one suggested prompt is required");
  }

  const existingByLanguage = await getAppSetting<unknown>(
    "suggestedPromptsByLanguage"
  );
  const promptsByLanguage: Record<string, string[]> = {};

  if (
    existingByLanguage &&
    typeof existingByLanguage === "object" &&
    !Array.isArray(existingByLanguage)
  ) {
    for (const [code, value] of Object.entries(
      existingByLanguage as Record<string, unknown>
    )) {
      if (!Array.isArray(value)) {
        continue;
      }

      const normalized = value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);

      if (normalized.length > 0) {
        promptsByLanguage[code] = normalized;
      }
    }
  }

  promptsByLanguage[language.code] = prompts;

  await setAppSetting({
    key: "suggestedPromptsByLanguage",
    value: promptsByLanguage,
  });
  revalidateAppSettingCache("suggestedPromptsByLanguage");

  if (language.isDefault) {
    await setAppSetting({ key: "suggestedPrompts", value: prompts });
    revalidateAppSettingCache("suggestedPrompts");
  }

  await createAuditLogEntry({
    actorId: actor.id,
    action: "ui.suggested_prompts.update",
    target: { feature: "suggestedPrompts", language: language.code },
    metadata: { count: prompts.length },
  });

  revalidatePath("/", "layout");
  revalidatePath("/chat");
  revalidatePath("/admin/settings");

  return {
    success: true as const,
    languageCode: language.code,
    count: prompts.length,
  };
}

export async function updateIconPromptsAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const payload = formData.get("payload");

  if (typeof payload !== "string") {
    throw new Error("Missing icon prompt payload");
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    console.error("Failed to parse icon prompt payload", error);
    throw new Error("Invalid icon prompt payload");
  }

  const normalized = normalizeIconPromptSettings(parsed, true);
  const uniqueItems = normalized.items.filter((item, index, items) => {
    return items.findIndex((entry) => entry.id === item.id) === index;
  });

  await setAppSetting({
    key: ICON_PROMPTS_SETTING_KEY,
    value: { items: uniqueItems },
  });
  revalidateAppSettingCache(ICON_PROMPTS_SETTING_KEY);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "ui.icon_prompts.update",
    target: { feature: "iconPrompts" },
    metadata: { count: uniqueItems.length },
  });

  revalidatePath("/", "layout");
  revalidatePath("/chat");
  revalidatePath("/admin/settings");

  return {
    success: true as const,
    count: uniqueItems.length,
  };
}

export async function createPricingPlanAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const name = formData.get("name")?.toString().trim();
  const description = formData.get("description")?.toString().trim() ?? "";
  const priceInRupees = parseNumber(formData.get("priceInRupees"));
  const tokenAllowance = Math.max(
    0,
    parseInteger(formData.get("tokenAllowance"))
  );
  const billingCycleDays = Math.max(
    0,
    parseInteger(formData.get("billingCycleDays"))
  );
  const isActive = parseBoolean(formData.get("isActive"));

  if (!name) {
    throw new Error("Plan name is required");
  }
  const plan = await createPricingPlan({
    name,
    description,
    priceInPaise: Math.max(0, Math.round(priceInRupees * 100)),
    tokenAllowance,
    billingCycleDays,
    isActive,
  });

  await registerTranslationKeys([
    {
      key: `recharge.plan.${plan.id}.name`,
      defaultText: plan.name,
    },
    {
      key: `recharge.plan.${plan.id}.description`,
      defaultText: description,
    },
  ]);

  await invalidateTranslationBundleCache();

  await createAuditLogEntry({
    actorId: actor.id,
    action: "billing.plan.create",
    target: { planId: plan.id },
    metadata: plan,
  });

  revalidateTag(PRICING_PLAN_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/recharge");
  revalidatePath("/subscriptions");

  redirect("/admin/settings?notice=plan-created");
}

export async function updatePricingPlanAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const id = formData.get("id")?.toString();

  if (!id) {
    throw new Error("Missing pricing plan id");
  }

  const updates: Record<string, unknown> = {};

  if (formData.has("name")) {
    updates.name = formData.get("name")?.toString().trim() ?? "";
  }
  if (formData.has("description")) {
    updates.description = formData.get("description")?.toString().trim() ?? "";
  }
  if (formData.has("priceInRupees")) {
    const rupees = parseNumber(formData.get("priceInRupees"));
    updates.priceInPaise = Math.max(0, Math.round(rupees * 100));
  }
  if (formData.has("tokenAllowance")) {
    updates.tokenAllowance = Math.max(
      0,
      parseInteger(formData.get("tokenAllowance"))
    );
  }
  if (formData.has("billingCycleDays")) {
    updates.billingCycleDays = Math.max(
      0,
      parseInteger(formData.get("billingCycleDays"))
    );
  }
  if (formData.has("isActive")) {
    updates.isActive = parseBoolean(formData.get("isActive"));
  }

  await updatePricingPlan({
    id,
    updates: updates as {
      name?: string;
      description?: string | null;
      priceInPaise?: number;
      tokenAllowance?: number;
      billingCycleDays?: number;
      isActive?: boolean;
    },
  });

  const updatedPlan = await getPricingPlanById({ id, includeDeleted: true });
  if (updatedPlan) {
    await registerTranslationKeys([
      {
        key: `recharge.plan.${updatedPlan.id}.name`,
        defaultText: updatedPlan.name,
      },
      {
        key: `recharge.plan.${updatedPlan.id}.description`,
        defaultText: updatedPlan.description ?? "",
      },
    ]);

    await invalidateTranslationBundleCache();
  }

  await createAuditLogEntry({
    actorId: actor.id,
    action: "billing.plan.update",
    target: { planId: id },
    metadata: updates,
  });

  revalidateTag(PRICING_PLAN_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/recharge");
  revalidatePath("/subscriptions");
  redirect("/admin/settings?notice=plan-updated");
}

export async function setRecommendedPricingPlanAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const rawValue = formData.get("planId");
  const planId = rawValue ? rawValue.toString().trim() : "";
  const value = planId.length > 0 ? planId : null;

  await setAppSetting({
    key: RECOMMENDED_PRICING_PLAN_SETTING_KEY,
    value,
  });
  revalidateAppSettingCache(RECOMMENDED_PRICING_PLAN_SETTING_KEY);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "billing.plan.recommendation.update",
    target: { planId: value },
    metadata: { planId: value },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/recharge");
  revalidatePath("/subscriptions");

  redirect("/admin/settings?notice=plan-recommendation-updated");
}

export async function deletePricingPlanAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const id = formData.get("id")?.toString();

  if (!id) {
    throw new Error("Missing pricing plan id");
  }

  await deletePricingPlan(id);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "billing.plan.delete",
    target: { planId: id },
  });

  revalidateTag(PRICING_PLAN_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/recharge");
  revalidatePath("/subscriptions");

  redirect("/admin/settings?notice=plan-deleted");
}

export async function hardDeletePricingPlanAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const id = formData.get("id")?.toString();

  if (!id) {
    throw new Error("Missing pricing plan id");
  }

  await hardDeletePricingPlan(id);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "billing.plan.hard_delete",
    target: { planId: id },
  });

  revalidateTag(PRICING_PLAN_CACHE_TAG);
  revalidatePath("/admin/settings");
  revalidatePath("/recharge");
  revalidatePath("/subscriptions");

  redirect("/admin/settings?notice=plan-hard-deleted");
}

export async function grantUserCreditsAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();
  const userId = formData.get("userId")?.toString();

  if (!userId) {
    throw new Error("Missing user id");
  }

  const credits = parseNumber(formData.get("credits"));
  const expiresInDays = formData.has("billingCycleDays")
    ? Math.max(1, parseInteger(formData.get("billingCycleDays")))
    : 90;

  if (!Number.isFinite(credits) || credits <= 0) {
    return;
  }

  const tokens = Math.max(1, Math.round(credits * TOKENS_PER_CREDIT));

  const subscription = await grantUserCredits({
    userId,
    tokens,
    expiresInDays,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "billing.manual_credit.grant",
    target: { userId, subscriptionId: subscription.id },
    metadata: {
      credits,
      tokens,
      expiresInDays,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath("/subscriptions");
  revalidatePath("/recharge");
}

export async function updateUserKnowledgeApprovalAction({
  entryId,
  approvalStatus,
}: {
  entryId: string;
  approvalStatus: RagEntryApprovalStatus;
}) {
  const actor = await requireAdmin();
  const entry = await updateUserAddedKnowledgeApproval({
    entryId,
    approvalStatus,
    actorId: actor.id,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "user.personal_knowledge.review",
    target: { entryId, userId: entry.personalForUserId },
    metadata: { approvalStatus },
  });

  revalidatePath("/admin/rag");
  revalidatePath("/profile");
  return entry;
}

export async function deleteUserKnowledgeEntryAction({
  entryId,
}: {
  entryId: string;
}) {
  const actor = await requireAdmin();

  await deletePersonalKnowledgeEntry({
    entryId,
    actorId: actor.id,
    allowOverride: true,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "user.personal_knowledge.delete",
    target: { entryId },
  });

  revalidatePath("/admin/rag");
  revalidatePath("/profile");
}

export async function createRagEntryAction(input: UpsertRagEntryInput) {
  const actor = await requireAdmin();
  const entry = await createRagEntry({
    input,
    actorId: actor.id,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "rag.entry.create",
    target: { ragEntryId: entry.id },
    metadata: { status: entry.status },
  });

  revalidatePath("/admin/rag");
  return entry;
}

export async function updateRagEntryAction({
  id,
  input,
}: {
  id: string;
  input: UpsertRagEntryInput;
}) {
  const actor = await requireAdmin();
  const entry = await updateRagEntry({
    id,
    input,
    actorId: actor.id,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "rag.entry.update",
    target: { ragEntryId: entry.id },
    metadata: { status: entry.status },
  });

  revalidatePath("/admin/rag");
  return entry;
}

type SerializedQuestionPaper = {
  id: string;
  title: string;
  exam: string;
  role: string;
  year: number;
  language: string;
  tags: string[];
  sourceUrl: string | null;
  status: RagEntryStatus;
  parseError?: string | null;
  createdAt: string;
  updatedAt: string;
};

const QUESTION_PAPER_FALLBACK_CONTENT =
  "Question paper uploaded, but text extraction failed. Use the attached PDF.";
const QUESTION_PAPER_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_QUESTION_PAPER_TITLE = "Question paper";
const UNKNOWN_LABEL = "Unknown";

const normalizeFilenameTitle = (filename: string) => {
  const base = filename.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || DEFAULT_QUESTION_PAPER_TITLE;
};

const resolveYearFromText = (value: string) => extractStudyYear(value) ?? null;

const normalizePaperTitle = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

const normalizeQuestionPaperTags = (value: FormDataEntryValue | null | undefined) => {
  const raw = value?.toString() ?? "";
  const entries = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(entries));
  return unique.map((tag) => tag.slice(0, 48)).slice(0, 24);
};

const resolveQuestionPaperStatus = (
  value: FormDataEntryValue | null | undefined
): RagEntryStatus => {
  const normalized = value?.toString().trim().toLowerCase();
  if (normalized === "inactive" || normalized === "archived") {
    return normalized;
  }
  return "active";
};

const serializeQuestionPaper = (paper: QuestionPaperRecord): SerializedQuestionPaper => {
  const serializeDate = (value: Date) =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString();

  return {
    id: paper.id,
    title: paper.title,
    exam: paper.exam,
    role: paper.role,
    year: paper.year,
    language: paper.language,
    tags: paper.tags,
    sourceUrl: paper.sourceUrl ?? null,
    status: paper.status,
    parseError: paper.parseError ?? null,
    createdAt: serializeDate(paper.createdAt),
    updatedAt: serializeDate(paper.updatedAt),
  };
};

async function processQuestionPaperFile({
  file,
  paperId,
}: {
  file: Blob;
  paperId: string;
}) {
  const mimeType = file.type;
  if (!isDocumentMimeType(mimeType)) {
    throw new Error("Only PDF, DOCX, or XLSX files are supported.");
  }
  if (file.size > QUESTION_PAPER_MAX_BYTES) {
    throw new Error("File size must be under 25MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename =
    "name" in file && typeof file.name === "string" ? file.name : "document";

  let content = QUESTION_PAPER_FALLBACK_CONTENT;
  let parseError: string | null = null;

  try {
    const parsed = await extractDocumentTextFromBuffer(
      {
        name: filename,
        buffer,
        mediaType: mimeType,
      },
      { maxTextChars: QUESTION_PAPER_MAX_TEXT_CHARS }
    );
    content = parsed.text;
  } catch (error) {
    parseError =
      error instanceof Error ? error.message : "Unable to extract document text.";
  }

  const extension = DOCUMENT_EXTENSION_BY_MIME[mimeType];
  if (!extension) {
    throw new Error("Unsupported file type.");
  }

  const objectKey = `study/question-papers/${paperId}/${crypto.randomUUID()}.${extension}`;
  const blob = await put(objectKey, buffer, {
    access: "public",
    contentType: mimeType,
  });

  return {
    sourceUrl: blob.url,
    content,
    parseError,
    filename,
  };
}

export async function createQuestionPaperAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const examInput = formData.get("exam")?.toString().trim() ?? "";
  const roleInput = formData.get("role")?.toString().trim() ?? "";
  const paperTitleInput = formData.get("paperTitle")?.toString().trim() ?? "";
  const yearInput = parseInteger(formData.get("year"));
  const languageInput = formData.get("language")?.toString().trim() || "English";
  const tags = normalizeQuestionPaperTags(formData.get("tags"));
  const status = resolveQuestionPaperStatus(formData.get("status"));

  const fileField = formData.get("file");
  if (!(fileField instanceof Blob)) {
    throw new Error("Question paper file is required.");
  }

  const paperId = generateUUID();
  const fileResult = await processQuestionPaperFile({
    file: fileField,
    paperId,
  });
  const derivedTitle = normalizeFilenameTitle(fileResult.filename);
  const derivedYear =
    resolveYearFromText(fileResult.content) ??
    resolveYearFromText(fileResult.filename) ??
    0;
  const exam = examInput || UNKNOWN_LABEL;
  const role = roleInput || UNKNOWN_LABEL;
  const year = Number.isFinite(yearInput) && yearInput > 0 ? yearInput : derivedYear;
  const paperTitle = paperTitleInput || derivedTitle || DEFAULT_QUESTION_PAPER_TITLE;
  const language = languageInput || "English";
  const normalizedTitle = normalizePaperTitle(paperTitle);
  const existingEntries = await listQuestionPaperEntries({ includeInactive: true });
  const duplicate = existingEntries.find((entry) => {
    const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
    const metaTitle =
      typeof metadata.paper_title === "string" ? metadata.paper_title : "";
    const titleToCheck = metaTitle || entry.title || "";
    return normalizePaperTitle(titleToCheck) === normalizedTitle;
  });
  if (duplicate) {
    throw new Error("A question paper with the same title already exists.");
  }

  const metadata = buildQuestionPaperMetadata({
    exam,
    role,
    year,
    paperId,
    paperTitle,
    language,
    tags,
    parseError: fileResult.parseError,
  });

  const createdEntry = await createRagEntry({
    actorId: actor.id,
    input: {
      id: paperId,
      title: paperTitle,
      content: fileResult.content,
      type: "document",
      status,
      tags,
      models: [],
      sourceUrl: fileResult.sourceUrl,
      metadata,
    },
  });

  const created = await getQuestionPaperById({
    id: paperId,
    includeInactive: true,
  });
  const resolvedCreated =
    created ??
    ({
      id: createdEntry.id,
      title: paperTitle,
      exam,
      role,
      year,
      language,
      tags,
      sourceUrl: createdEntry.sourceUrl ?? null,
      status: createdEntry.status,
      parseError: fileResult.parseError ?? null,
      createdAt:
        createdEntry.createdAt instanceof Date
          ? createdEntry.createdAt
          : new Date(createdEntry.createdAt),
      updatedAt:
        createdEntry.updatedAt instanceof Date
          ? createdEntry.updatedAt
          : new Date(createdEntry.updatedAt),
    } as QuestionPaperRecord);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "study.question_paper.create",
    target: { questionPaperId: paperId },
    metadata: { exam, role, year, status },
  });

  revalidatePath("/admin/study/question-papers");
  return serializeQuestionPaper(resolvedCreated);
}

export async function updateQuestionPaperAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const id = formData.get("id")?.toString().trim() ?? "";
  if (!id) {
    throw new Error("Question paper id is required.");
  }

  const entries = await listQuestionPaperEntries({ includeInactive: true });
  const existing = entries.find((entry) => entry.id === id);
  if (!existing) {
    throw new Error("Question paper not found.");
  }

  const examInput = formData.get("exam")?.toString().trim() ?? "";
  const roleInput = formData.get("role")?.toString().trim() ?? "";
  const paperTitleInput = formData.get("paperTitle")?.toString().trim() ?? "";
  const yearInput = parseInteger(formData.get("year"));
  const languageInput = formData.get("language")?.toString().trim() || "";
  const tagsInput = normalizeQuestionPaperTags(formData.get("tags"));
  const status = resolveQuestionPaperStatus(formData.get("status"));

  let sourceUrl = existing.sourceUrl ?? null;
  let content = existing.content;
  const existingMetadata = (existing.metadata ?? {}) as Record<string, unknown>;
  let parseError =
    typeof existingMetadata.parse_error === "string"
      ? existingMetadata.parse_error
      : null;
  const existingExam =
    typeof existingMetadata.exam === "string" && existingMetadata.exam.trim()
      ? existingMetadata.exam.trim()
      : "";
  const existingRole =
    typeof existingMetadata.role === "string" && existingMetadata.role.trim()
      ? existingMetadata.role.trim()
      : "";
  const existingYearRaw =
    typeof existingMetadata.year === "number"
      ? existingMetadata.year
      : typeof existingMetadata.year === "string"
        ? Number.parseInt(existingMetadata.year, 10)
        : 0;
  const existingYear =
    Number.isFinite(existingYearRaw) && existingYearRaw > 0 ? existingYearRaw : 0;
  const existingTitle =
    typeof existingMetadata.paper_title === "string" && existingMetadata.paper_title.trim()
      ? existingMetadata.paper_title.trim()
      : existing.title?.trim() ?? "";
  const existingLanguage =
    typeof existingMetadata.language === "string" && existingMetadata.language.trim()
      ? existingMetadata.language.trim()
      : "English";
  const existingTags = Array.isArray(existingMetadata.tags)
    ? existingMetadata.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
    : Array.isArray(existing.tags)
      ? existing.tags
      : [];

  const fileField = formData.get("file");
  let filename: string | null = null;
  if (fileField instanceof Blob && fileField.size > 0) {
    const fileResult = await processQuestionPaperFile({
      file: fileField,
      paperId: id,
    });
    sourceUrl = fileResult.sourceUrl;
    content = fileResult.content;
    parseError = fileResult.parseError;
    filename = fileResult.filename;
  }

  const derivedTitle = filename ? normalizeFilenameTitle(filename) : "";
  const derivedYear =
    resolveYearFromText(content) ?? (filename ? resolveYearFromText(filename) : null) ?? 0;
  const exam = examInput || existingExam || UNKNOWN_LABEL;
  const role = roleInput || existingRole || UNKNOWN_LABEL;
  const year =
    Number.isFinite(yearInput) && yearInput > 0
      ? yearInput
      : derivedYear || existingYear || 0;
  const paperTitle =
    paperTitleInput || existingTitle || derivedTitle || DEFAULT_QUESTION_PAPER_TITLE;
  const language = languageInput || existingLanguage || "English";
  const tags = tagsInput.length > 0 ? tagsInput : existingTags;

  const metadata = buildQuestionPaperMetadata({
    exam,
    role,
    year,
    paperId: id,
    paperTitle,
    language,
    tags,
    parseError,
  });

  const updatedEntry = await updateRagEntry({
    id,
    actorId: actor.id,
    input: {
      title: paperTitle,
      content,
      type: "document",
      status,
      tags,
      models: Array.isArray(existing.models) ? existing.models : [],
      sourceUrl,
      metadata,
      categoryId: existing.categoryId,
    },
  });

  const updated = await getQuestionPaperById({ id, includeInactive: true });
  const resolvedUpdated =
    updated ??
    ({
      id: updatedEntry.id,
      title: paperTitle,
      exam,
      role,
      year,
      language,
      tags,
      sourceUrl: updatedEntry.sourceUrl ?? null,
      status: updatedEntry.status,
      parseError,
      createdAt:
        updatedEntry.createdAt instanceof Date
          ? updatedEntry.createdAt
          : new Date(updatedEntry.createdAt),
      updatedAt:
        updatedEntry.updatedAt instanceof Date
          ? updatedEntry.updatedAt
          : new Date(updatedEntry.updatedAt),
    } as QuestionPaperRecord);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "study.question_paper.update",
    target: { questionPaperId: id },
    metadata: { exam, role, year, status },
  });

  revalidatePath("/admin/study/question-papers");
  return serializeQuestionPaper(resolvedUpdated);
}

export async function deleteQuestionPaperAction({ id }: { id: string }) {
  "use server";
  const actor = await requireAdmin();

  if (!id) {
    throw new Error("Question paper id is required.");
  }

  const entries = await listQuestionPaperEntries({ includeInactive: true });
  const existing = entries.find((entry) => entry.id === id);
  if (!existing) {
    throw new Error("Question paper not found.");
  }

  await deleteRagEntries({ ids: [id], actorId: actor.id });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "study.question_paper.delete",
    target: { questionPaperId: id },
  });

  revalidatePath("/admin/study/question-papers");
}

type SerializedJobPosting = {
  id: string;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  studyExam: string;
  studyRole: string;
  studyYears: number[];
  studyTags: string[];
  tags: string[];
  sourceUrl: string | null;
  status: RagEntryStatus;
  parseError?: string | null;
  createdAt: string;
  updatedAt: string;
};

const JOB_POSTING_FALLBACK_CONTENT =
  "Job posting uploaded, but text extraction failed. Use the attached file.";
const JOB_POSTING_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_JOB_POSTING_TITLE = "Job posting";
const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

const normalizeJobPostingTags = (value: FormDataEntryValue | null | undefined) => {
  const raw = value?.toString() ?? "";
  const entries = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(entries));
  return unique.map((tag) => tag.slice(0, 48)).slice(0, 24);
};

const normalizeJobPostingStudyTags = (
  value: FormDataEntryValue | null | undefined
) => {
  const raw = value?.toString() ?? "";
  const entries = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(entries));
  return unique.map((tag) => tag.slice(0, 48)).slice(0, 24);
};

const normalizeJobPostingStudyYears = (
  value: FormDataEntryValue | null | undefined
) => {
  const raw = value?.toString() ?? "";
  if (!raw.trim()) {
    return [];
  }

  const parts = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const parsed = parts
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.trunc(item));

  return Array.from(new Set(parsed)).slice(0, 12);
};

const resolveJobPostingStatus = (
  value: FormDataEntryValue | null | undefined
): RagEntryStatus => {
  const normalized = value?.toString().trim().toLowerCase();
  if (normalized === "inactive" || normalized === "archived") {
    return normalized;
  }
  return "active";
};

const serializeJobPosting = (job: JobPostingRecord): SerializedJobPosting => {
  const serializeDate = (value: Date) =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString();

  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    employmentType: job.employmentType,
    studyExam: job.studyExam,
    studyRole: job.studyRole,
    studyYears: job.studyYears,
    studyTags: job.studyTags,
    tags: job.tags,
    sourceUrl: job.sourceUrl ?? null,
    status: job.status,
    parseError: job.parseError ?? null,
    createdAt: serializeDate(job.createdAt),
    updatedAt: serializeDate(job.updatedAt),
  };
};

async function processJobPostingFile({
  file,
  jobId,
}: {
  file: Blob;
  jobId: string;
}) {
  const mimeType = file.type;
  const isDocument = isDocumentMimeType(mimeType);
  const isImage = (IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
  if (!isDocument && !isImage) {
    throw new Error("Only PDF, DOCX, XLSX, JPEG, or PNG files are supported.");
  }
  if (file.size > JOB_POSTING_MAX_BYTES) {
    throw new Error("File size must be under 25MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename =
    "name" in file && typeof file.name === "string" ? file.name : "document";

  let content = JOB_POSTING_FALLBACK_CONTENT;
  let parseError: string | null = null;

  if (isDocument) {
    try {
      const parsed = await extractDocumentTextFromBuffer(
        {
          name: filename,
          buffer,
          mediaType: mimeType,
        },
        { maxTextChars: JOB_POSTING_MAX_TEXT_CHARS }
      );
      content = parsed.text;
    } catch (error) {
      parseError =
        error instanceof Error ? error.message : "Unable to extract document text.";
    }
  } else {
    parseError = "Image uploaded without OCR extraction.";
  }

  const extension = isDocument
    ? DOCUMENT_EXTENSION_BY_MIME[mimeType]
    : IMAGE_EXTENSION_BY_MIME[mimeType];
  if (!extension) {
    throw new Error("Unsupported file type.");
  }

  const objectKey = `jobs/postings/${jobId}/${crypto.randomUUID()}.${extension}`;
  const blob = await put(objectKey, buffer, {
    access: "public",
    contentType: mimeType,
  });

  return {
    sourceUrl: blob.url,
    content,
    parseError,
    filename,
  };
}

export async function createJobPostingAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const companyInput = formData.get("company")?.toString().trim() ?? "";
  const locationInput = formData.get("location")?.toString().trim() ?? "";
  const employmentTypeInput =
    formData.get("employmentType")?.toString().trim() ?? "";
  const studyExamInput = formData.get("studyExam")?.toString().trim() ?? "";
  const studyRoleInput = formData.get("studyRole")?.toString().trim() ?? "";
  const studyYears = normalizeJobPostingStudyYears(formData.get("studyYears"));
  const studyTags = normalizeJobPostingStudyTags(formData.get("studyTags"));
  const jobTitleInput = formData.get("jobTitle")?.toString().trim() ?? "";
  const tags = normalizeJobPostingTags(formData.get("tags"));
  const status = resolveJobPostingStatus(formData.get("status"));

  const fileField = formData.get("file");
  if (!(fileField instanceof Blob)) {
    throw new Error("Job posting file is required.");
  }
  if (!studyExamInput || !studyRoleInput) {
    throw new Error("Study exam and Study role are required for job-study integration.");
  }

  const jobId = generateUUID();
  const fileResult = await processJobPostingFile({
    file: fileField,
    jobId,
  });
  const derivedTitle = normalizeFilenameTitle(fileResult.filename);
  const company = companyInput || UNKNOWN_LABEL;
  const location = locationInput || UNKNOWN_LABEL;
  const employmentType = employmentTypeInput || UNKNOWN_LABEL;
  const studyExam = studyExamInput || UNKNOWN_LABEL;
  const studyRole = studyRoleInput || UNKNOWN_LABEL;
  const jobTitle = jobTitleInput || derivedTitle || DEFAULT_JOB_POSTING_TITLE;
  const normalizedTitle = normalizePaperTitle(jobTitle);
  const normalizedCompany = normalizePaperTitle(company);
  const existingEntries = await listJobPostingEntries({ includeInactive: true });
  const duplicate = existingEntries.find((entry) => {
    const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
    const metaTitle = typeof metadata.job_title === "string" ? metadata.job_title : "";
    const metaCompany = typeof metadata.company === "string" ? metadata.company : "";
    const titleToCheck = metaTitle || entry.title || "";
    const companyToCheck = metaCompany || entry.company || "";
    return (
      normalizePaperTitle(titleToCheck) === normalizedTitle &&
      normalizePaperTitle(companyToCheck) === normalizedCompany
    );
  });
  if (duplicate) {
    throw new Error("A job posting with the same title already exists for this company.");
  }

  const metadata = buildJobPostingMetadata({
    jobId,
    jobTitle,
    company,
    location,
    employmentType,
    studyExam,
    studyRole,
    studyYears,
    studyTags,
    tags,
    parseError: fileResult.parseError,
  });

  const createdEntry = await createRagEntry({
    actorId: actor.id,
    input: {
      id: jobId,
      title: jobTitle,
      content: fileResult.content,
      type: "document",
      status,
      tags,
      models: [],
      sourceUrl: fileResult.sourceUrl,
      metadata,
    },
  });

  const created = await getJobPostingById({
    id: jobId,
    includeInactive: true,
  });
  const resolvedCreated =
    created ??
    ({
      id: createdEntry.id,
      title: jobTitle,
      company,
      location,
      employmentType,
      studyExam,
      studyRole,
      studyYears,
      studyTags,
      tags,
      sourceUrl: createdEntry.sourceUrl ?? null,
      status: createdEntry.status,
      parseError: fileResult.parseError ?? null,
      createdAt:
        createdEntry.createdAt instanceof Date
          ? createdEntry.createdAt
          : new Date(createdEntry.createdAt),
      updatedAt:
        createdEntry.updatedAt instanceof Date
          ? createdEntry.updatedAt
          : new Date(createdEntry.updatedAt),
    } as JobPostingRecord);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "jobs.posting.create",
    target: { jobPostingId: jobId },
    metadata: {
      company,
      location,
      employmentType,
      studyExam,
      studyRole,
      studyYears,
      status,
    },
  });

  revalidatePath("/admin/jobs");
  return serializeJobPosting(resolvedCreated);
}

export async function updateJobPostingAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const id = formData.get("id")?.toString().trim() ?? "";
  if (!id) {
    throw new Error("Job posting id is required.");
  }

  const entries = await listJobPostingEntries({ includeInactive: true });
  const existing = entries.find((entry) => entry.id === id);
  if (!existing) {
    throw new Error("Job posting not found.");
  }

  const companyInput = formData.get("company")?.toString().trim() ?? "";
  const locationInput = formData.get("location")?.toString().trim() ?? "";
  const employmentTypeInput =
    formData.get("employmentType")?.toString().trim() ?? "";
  const studyExamInput = formData.get("studyExam")?.toString().trim() ?? "";
  const studyRoleInput = formData.get("studyRole")?.toString().trim() ?? "";
  const studyYearsInput = normalizeJobPostingStudyYears(formData.get("studyYears"));
  const studyTagsInput = normalizeJobPostingStudyTags(formData.get("studyTags"));
  const jobTitleInput = formData.get("jobTitle")?.toString().trim() ?? "";
  const tagsInput = normalizeJobPostingTags(formData.get("tags"));
  const status = resolveJobPostingStatus(formData.get("status"));

  let sourceUrl = existing.sourceUrl ?? null;
  let content = existing.content;
  const existingMetadata = (existing.metadata ?? {}) as Record<string, unknown>;
  let parseError =
    typeof existingMetadata.parse_error === "string"
      ? existingMetadata.parse_error
      : null;
  const existingCompany =
    typeof existingMetadata.company === "string" && existingMetadata.company.trim()
      ? existingMetadata.company.trim()
      : "";
  const existingLocation =
    typeof existingMetadata.location === "string" && existingMetadata.location.trim()
      ? existingMetadata.location.trim()
      : "";
  const existingEmploymentType =
    typeof existingMetadata.employment_type === "string" &&
    existingMetadata.employment_type.trim()
      ? existingMetadata.employment_type.trim()
      : "";
  const existingStudyExam =
    typeof existingMetadata.study_exam === "string" &&
    existingMetadata.study_exam.trim()
      ? existingMetadata.study_exam.trim()
      : typeof existingMetadata.exam === "string" && existingMetadata.exam.trim()
        ? existingMetadata.exam.trim()
        : "";
  const existingStudyRole =
    typeof existingMetadata.study_role === "string" &&
    existingMetadata.study_role.trim()
      ? existingMetadata.study_role.trim()
      : typeof existingMetadata.role === "string" && existingMetadata.role.trim()
        ? existingMetadata.role.trim()
        : "";
  const existingStudyYearsRaw = Array.isArray(existingMetadata.study_years)
    ? existingMetadata.study_years
    : Array.isArray(existingMetadata.years)
      ? existingMetadata.years
      : [];
  const existingStudyYears = Array.from(
    new Set(
      existingStudyYearsRaw
        .map((value) => {
          if (typeof value === "number" && Number.isFinite(value)) {
            return Math.trunc(value);
          }
          if (typeof value === "string") {
            const parsed = Number.parseInt(value.trim(), 10);
            return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
          }
          return null;
        })
        .filter((value): value is number => Boolean(value && value > 0))
    )
  );
  const existingStudyTags = Array.isArray(existingMetadata.study_tags)
    ? existingMetadata.study_tags
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const existingTitle =
    typeof existingMetadata.job_title === "string" && existingMetadata.job_title.trim()
      ? existingMetadata.job_title.trim()
      : existing.title?.trim() ?? "";
  const existingTags = Array.isArray(existingMetadata.tags)
    ? existingMetadata.tags
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : Array.isArray(existing.tags)
      ? existing.tags
      : [];

  const fileField = formData.get("file");
  let filename: string | null = null;
  if (fileField instanceof Blob && fileField.size > 0) {
    const fileResult = await processJobPostingFile({
      file: fileField,
      jobId: id,
    });
    sourceUrl = fileResult.sourceUrl;
    content = fileResult.content;
    parseError = fileResult.parseError;
    filename = fileResult.filename;
  }

  const derivedTitle = filename ? normalizeFilenameTitle(filename) : "";
  const company = companyInput || existingCompany || UNKNOWN_LABEL;
  const location = locationInput || existingLocation || UNKNOWN_LABEL;
  const employmentType =
    employmentTypeInput || existingEmploymentType || UNKNOWN_LABEL;
  const studyExam = studyExamInput || existingStudyExam || UNKNOWN_LABEL;
  const studyRole = studyRoleInput || existingStudyRole || UNKNOWN_LABEL;
  if (
    !studyExam.trim() ||
    !studyRole.trim() ||
    studyExam.trim().toLowerCase() === "unknown" ||
    studyRole.trim().toLowerCase() === "unknown"
  ) {
    throw new Error("Study exam and Study role are required for job-study integration.");
  }
  const studyYears =
    studyYearsInput.length > 0 ? studyYearsInput : existingStudyYears;
  const studyTags = studyTagsInput.length > 0 ? studyTagsInput : existingStudyTags;
  const jobTitle = jobTitleInput || existingTitle || derivedTitle || DEFAULT_JOB_POSTING_TITLE;
  const tags = tagsInput.length > 0 ? tagsInput : existingTags;

  const metadata = buildJobPostingMetadata({
    jobId: id,
    jobTitle,
    company,
    location,
    employmentType,
    studyExam,
    studyRole,
    studyYears,
    studyTags,
    tags,
    parseError,
  });

  const updatedEntry = await updateRagEntry({
    id,
    actorId: actor.id,
    input: {
      title: jobTitle,
      content,
      type: "document",
      status,
      tags,
      models: Array.isArray(existing.models) ? existing.models : [],
      sourceUrl,
      metadata,
      categoryId: existing.categoryId,
    },
  });

  const updated = await getJobPostingById({ id, includeInactive: true });
  const resolvedUpdated =
    updated ??
    ({
      id: updatedEntry.id,
      title: jobTitle,
      company,
      location,
      employmentType,
      studyExam,
      studyRole,
      studyYears,
      studyTags,
      tags,
      sourceUrl: updatedEntry.sourceUrl ?? null,
      status: updatedEntry.status,
      parseError,
      createdAt:
        updatedEntry.createdAt instanceof Date
          ? updatedEntry.createdAt
          : new Date(updatedEntry.createdAt),
      updatedAt:
        updatedEntry.updatedAt instanceof Date
          ? updatedEntry.updatedAt
          : new Date(updatedEntry.updatedAt),
    } as JobPostingRecord);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "jobs.posting.update",
    target: { jobPostingId: id },
    metadata: {
      company,
      location,
      employmentType,
      studyExam,
      studyRole,
      studyYears,
      status,
    },
  });

  revalidatePath("/admin/jobs");
  return serializeJobPosting(resolvedUpdated);
}

export async function deleteJobPostingAction({ id }: { id: string }) {
  "use server";
  const actor = await requireAdmin();

  if (!id) {
    throw new Error("Job posting id is required.");
  }

  const entries = await listJobPostingEntries({ includeInactive: true });
  const existing = entries.find((entry) => entry.id === id);
  if (!existing) {
    throw new Error("Job posting not found.");
  }

  await deleteRagEntries({ ids: [id], actorId: actor.id });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "jobs.posting.delete",
    target: { jobPostingId: id },
  });

  revalidatePath("/admin/jobs");
}

function sanitizeAliasList(values: string[]) {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  }
  return Array.from(unique);
}

function sanitizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeRefImages(refImages: CharacterRefImage[]) {
  return refImages
    .map((ref) => ({
      imageId: ref.imageId?.trim() || null,
      storageKey: ref.storageKey?.trim() || null,
      url: ref.url?.trim() || null,
      mimeType: ref.mimeType?.trim() || "image/png",
      role: ref.role?.trim() || null,
      isPrimary: Boolean(ref.isPrimary),
      updatedAt: ref.updatedAt?.trim() || new Date().toISOString(),
    }))
    .filter((ref) => ref.url || ref.storageKey || ref.imageId);
}

export async function createCharacterAction({
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
}) {
  await requireAdmin();

  const trimmedName = canonicalName.trim();
  if (!trimmedName) {
    throw new Error("Canonical name is required.");
  }

  const sanitizedAliases = sanitizeAliasList(aliases);
  const sanitizedRefImages = sanitizeRefImages(refImages);

  const character = await createCharacterWithAliases({
    canonicalName: trimmedName,
    aliases: sanitizedAliases,
    refImages: sanitizedRefImages,
    lockedPrompt: sanitizeOptionalText(lockedPrompt),
    negativePrompt: sanitizeOptionalText(negativePrompt),
    gender: sanitizeOptionalText(gender),
    height: sanitizeOptionalText(height),
    weight: sanitizeOptionalText(weight),
    complexion: sanitizeOptionalText(complexion),
    priority: Number.isFinite(priority) ? Number(priority) : 0,
    enabled: enabled ?? true,
  });

  revalidatePath("/admin/characters");
  return character;
}

export async function updateCharacterAction({
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
}) {
  await requireAdmin();

  const trimmedName = canonicalName.trim();
  if (!trimmedName) {
    throw new Error("Canonical name is required.");
  }

  const sanitizedAliases = sanitizeAliasList(aliases);
  const sanitizedRefImages = sanitizeRefImages(refImages);

  const character = await updateCharacterWithAliases({
    id,
    canonicalName: trimmedName,
    aliases: sanitizedAliases,
    refImages: sanitizedRefImages,
    lockedPrompt: sanitizeOptionalText(lockedPrompt),
    negativePrompt: sanitizeOptionalText(negativePrompt),
    gender: sanitizeOptionalText(gender),
    height: sanitizeOptionalText(height),
    weight: sanitizeOptionalText(weight),
    complexion: sanitizeOptionalText(complexion),
    priority: Number.isFinite(priority) ? Number(priority) : 0,
    enabled: enabled ?? true,
  });

  revalidatePath("/admin/characters");
  return character;
}

export async function deleteCharacterAction({ id }: { id: string }) {
  await requireAdmin();
  await deleteCharacterById(id);
  revalidatePath("/admin/characters");
}

export async function bulkUpdateRagEntryStatusAction({
  ids,
  status,
}: {
  ids: string[];
  status: RagEntryStatus;
}) {
  const actor = await requireAdmin();
  const updated = await bulkUpdateRagStatus({
    ids,
    status,
    actorId: actor.id,
  });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "rag.entry.bulk_status",
    target: { ragEntryIds: ids },
    metadata: { status, count: updated.length },
  });

  revalidatePath("/admin/rag");
  return updated;
}

export async function deleteRagEntriesAction({ ids }: { ids: string[] }) {
  const actor = await requireAdmin();
  await deleteRagEntries({ ids, actorId: actor.id });
  await createAuditLogEntry({
    actorId: actor.id,
    action: "rag.entry.archive",
    target: { ragEntryIds: ids },
    metadata: { count: ids.length },
  });
  revalidatePath("/admin/rag");
}

export async function restoreRagEntryAction({ id }: { id: string }) {
  const actor = await requireAdmin();
  await restoreRagEntry({ id, actorId: actor.id });
  await createAuditLogEntry({
    actorId: actor.id,
    action: "rag.entry.restore",
    target: { ragEntryId: id },
  });
  revalidatePath("/admin/rag");
}

export async function restoreRagVersionAction({
  entryId,
  versionId,
}: {
  entryId: string;
  versionId: string;
}) {
  const actor = await requireAdmin();
  await restoreRagVersion({ entryId, versionId, actorId: actor.id });
  await createAuditLogEntry({
    actorId: actor.id,
    action: "rag.entry.version.restore",
    target: { ragEntryId: entryId, versionId },
  });
  revalidatePath("/admin/rag");
}

export async function createRagCategoryAction(name: string) {
  const actor = await requireAdmin();
  const category = await createRagCategory({ name });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "rag.category.create",
    target: { ragCategoryId: category.id },
    metadata: { name: category.name },
  });

  revalidatePath("/admin/rag");
  return category;
}
