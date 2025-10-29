"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import {
  createAuditLogEntry,
  deleteChatById,
  hardDeleteChatById,
  restoreChatById,
  createModelConfig,
  updateModelConfig,
  deleteModelConfig,
  hardDeleteModelConfig,
  setDefaultModelConfig,
  setAppSetting,
  updateUserActiveState,
  updateUserRole,
  createPricingPlan,
  grantUserCredits,
  updatePricingPlan,
  deletePricingPlan,
  hardDeletePricingPlan,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import { TOKENS_PER_CREDIT, RECOMMENDED_PRICING_PLAN_SETTING_KEY } from "@/lib/constants";

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

  const created = await createModelConfig({
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
  });

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

function parseInteger(value: FormDataEntryValue | null | undefined) {
  return Math.round(parseNumber(value));
}

export async function updateSuggestedPromptsAction(formData: FormData) {
  "use server";
  const actor = await requireAdmin();

  const promptsValue = formData.get("prompts")?.toString() ?? "";
  const prompts = promptsValue
    .split(/\r?\n/)
    .map((prompt) => prompt.trim())
    .filter((prompt) => prompt.length > 0);

  if (!prompts.length) {
    throw new Error("At least one suggested prompt is required");
  }

  await setAppSetting({ key: "suggestedPrompts", value: prompts });

  await createAuditLogEntry({
    actorId: actor.id,
    action: "ui.suggested_prompts.update",
    target: { feature: "suggestedPrompts" },
    metadata: { count: prompts.length },
  });

  revalidatePath("/", "layout");
  revalidatePath("/chat");
  revalidatePath("/admin/settings");

  redirect("/admin/settings?notice=suggested-prompts-updated");
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


