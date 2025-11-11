"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import {
  createAuditLogEntry,
  deleteChatById,
  hardDeleteChatById,
  restoreChatById,
  createModelConfig,
  getModelConfigByKey,
  updateModelConfig,
  deleteModelConfig,
  hardDeleteModelConfig,
  setDefaultModelConfig,
  getAppSetting,
  setAppSetting,
  updateUserActiveState,
  updateUserRole,
  createPricingPlan,
  grantUserCredits,
  updatePricingPlan,
  deletePricingPlan,
  hardDeletePricingPlan,
  getPricingPlanById,
  upsertTranslationValueEntry,
  deleteTranslationValueEntry,
  getTranslationKeyByKey,
  createLanguageEntry,
  getLanguageByIdRaw,
  updateLanguageActiveState,
  upsertCoupon,
  setCouponStatus,
  setCouponRewardStatus,
  recordCouponRewardPayout,
} from "@/lib/db/queries";
import type { RagEntryStatus, UserRole } from "@/lib/db/schema";
import {
  DEFAULT_FREE_MESSAGES_PER_DAY,
  FREE_MESSAGE_SETTINGS_KEY,
  FORUM_FEATURE_FLAG_KEY,
  RECOMMENDED_PRICING_PLAN_SETTING_KEY,
  TOKENS_PER_CREDIT,
} from "@/lib/constants";
import { normalizeFreeMessageSettings } from "@/lib/free-messages";
import { getDefaultLanguage, getLanguageByCode } from "@/lib/i18n/languages";
import {
  invalidateTranslationBundleCache,
  registerTranslationKeys,
} from "@/lib/i18n/dictionary";
import {
  createRagEntry,
  updateRagEntry,
  bulkUpdateRagStatus,
  deleteRagEntries,
  restoreRagEntry,
  restoreRagVersion,
  getRagVersions,
} from "@/lib/rag/service";
import type { UpsertRagEntryInput } from "@/lib/rag/types";

async function requireAdmin() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    throw new Error("forbidden");
  }

  return session.user;
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
  const actor = await requireAdmin();
  const enabled = parseBoolean(formData.get("forumEnabled"));

  await setAppSetting({
    key: FORUM_FEATURE_FLAG_KEY,
    value: enabled,
  });
  await createAuditLogEntry({
    actorId: actor.id,
    action: "forum.toggle",
    target: { setting: FORUM_FEATURE_FLAG_KEY },
    metadata: { enabled },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  revalidatePath("/forum");
  revalidatePath("/forum/[slug]");
}

function parseBoolean(value: FormDataEntryValue | null | undefined) {
  if (!value) {
    return false;
  }
  const normalized = value.toString().toLowerCase();
  return normalized === "true" || normalized === "on" || normalized === "1";
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

function convertIstDateToUtc(date: Date, hours: number, minutes: number, seconds: number, ms: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const istTimestamp = Date.UTC(year, month, day, hours, minutes, seconds, ms);
  return new Date(istTimestamp - IST_OFFSET_MINUTES * 60 * 1000);
}

function normalizeStartOfDayIst(date: Date) {
  return convertIstDateToUtc(date, 0, 0, 0, 0);
}

function normalizeEndOfDayIst(date: Date) {
  return convertIstDateToUtc(date, 23, 59, 59, 999);
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

  const normalizedStatus =
    rewardStatusRaw === "paid" ? "paid" : "pending";

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
  const config = parseJson(formData.get("configJson"));
  const inputCostPerMillion = parseNumber(
    formData.get("inputCostPerMillion")
  );
  const outputCostPerMillion = parseNumber(
    formData.get("outputCostPerMillion")
  );
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
      inputCostPerMillion,
      outputCostPerMillion,
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
    inputCostPerMillion?: number;
    outputCostPerMillion?: number;
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

  if (formData.has("supportsReasoning")) {
    patch.supportsReasoning = parseBoolean(
      formData.get("supportsReasoning")
    );
  }

  if (formData.has("reasoningTag")) {
    patch.reasoningTag = formData.get("reasoningTag")?.toString() ?? null;
  }

  if (formData.has("configJson")) {
    patch.config = parseJson(formData.get("configJson"));
  }

  if (formData.has("isEnabled")) {
    patch.isEnabled = parseBoolean(formData.get("isEnabled"));
  }

  if (formData.has("isDefault")) {
    patch.isDefault = parseBoolean(formData.get("isDefault"));
  }

  if (formData.has("inputCostPerMillion")) {
    patch.inputCostPerMillion = parseNumber(
      formData.get("inputCostPerMillion")
    );
  }

  if (formData.has("outputCostPerMillion")) {
    patch.outputCostPerMillion = parseNumber(
      formData.get("outputCostPerMillion")
    );
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

  revalidatePath("/admin/settings");
  revalidatePath("/chat", "layout");
  revalidatePath("/chat");
  revalidatePath("/", "layout");

  redirect("/admin/settings?notice=model-updated");
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

  revalidatePath("/admin/settings");

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

  revalidatePath("/admin/settings");

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

  revalidatePath("/admin/settings");

  redirect("/admin/settings?notice=model-defaulted");
}

export async function setArtifactsEnabledAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const enabled = parseBoolean(formData.get("artifactsEnabled"));

  await setAppSetting({ key: "artifactsEnabled", value: enabled });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "feature.artifacts.toggle",
    target: { feature: "artifacts" },
    metadata: { enabled },
  });

  revalidatePath("/", "layout");
  revalidatePath("/chat");
  revalidatePath("/admin/settings");
}

export async function updatePrivacyPolicyAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const content = formData.get("content")?.toString().trim() ?? "";

  await setAppSetting({ key: "privacyPolicy", value: content });

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

  if (language.isDefault) {
    await setAppSetting({ key: "aboutUsContent", value: content });
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

  if (language.isDefault) {
    await setAppSetting({ key: "privacyPolicy", value: content });
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

export async function updateTermsOfServiceByLanguageAction(
  formData: FormData
) {
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

  if (language.isDefault) {
    await setAppSetting({ key: "termsOfService", value: content });
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

  const normalizedCode = code.toLowerCase();

  if (!normalizedCode || !name) {
    redirect("/admin/settings?notice=language-create-error");
  }

  if (!/^[a-z0-9-]{2,16}$/.test(normalizedCode)) {
    redirect("/admin/settings?notice=language-code-invalid");
  }

  try {
    await createLanguageEntry({
      code: normalizedCode,
      name,
      isDefault: false,
      isActive,
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
    metadata: { name, isActive },
  });

  await invalidateTranslationBundleCache([normalizedCode]);

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

  await updateLanguageActiveState({ id: targetLanguage.id, isActive: shouldActivate });

  await invalidateTranslationBundleCache([targetLanguage.code]);

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

export async function updatePlanTranslationAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const planId = formData.get("planId")?.toString();
  const languageCodeRaw = formData.get("languageCode")?.toString();

  if (!planId || !languageCodeRaw) {
    redirect("/admin/settings?notice=plan-translation-error");
  }

  try {
    const plan = await getPricingPlanById({ id: planId!, includeDeleted: true });
    if (!plan) {
      throw new Error("Plan not found");
    }

    const languageCode = languageCodeRaw!.trim().toLowerCase();
    const language = languageCode.length > 0 ? await getLanguageByCode(languageCode) : null;

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

  redirect("/admin/settings?notice=free-messages-updated");
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
    .split(/\r?\n/)
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

  if (language.isDefault) {
    await setAppSetting({ key: "suggestedPrompts", value: prompts });
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

export async function createPricingPlanAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const name = formData.get("name")?.toString().trim();
  const description = formData.get("description")?.toString().trim() ?? "";
  const priceInRupees = parseNumber(formData.get("priceInRupees"));
  const tokenAllowance = Math.max(0, parseInteger(formData.get("tokenAllowance")));
  const billingCycleDays = Math.max(0, parseInteger(formData.get("billingCycleDays")));
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

  const tokens = Math.max(
    1,
    Math.round(credits * TOKENS_PER_CREDIT)
  );

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


