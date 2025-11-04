"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/app/(auth)/auth";
import {
  createAuditLogEntry,
  deleteTranslationValueEntry,
  upsertTranslationValueEntry,
  updateTranslationDefaultText,
} from "@/lib/db/queries";
import { getLanguageByCode } from "@/lib/i18n/languages";
import {
  invalidateTranslationBundleCache,
  publishAllTranslations,
} from "@/lib/i18n/dictionary";

const TRANSLATIONS_PATH = "/admin/translations";

async function requireAdminUser() {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    throw new Error("forbidden");
  }

  return session.user;
}

function normalizeText(value: FormDataEntryValue | null) {
  if (value === null) {
    return "";
  }
  return value.toString().trim();
}

export async function saveDefaultTextAction(formData: FormData) {
  const actor = await requireAdminUser();

  const keyId = normalizeText(formData.get("keyId"));
  const defaultText = normalizeText(formData.get("defaultText"));
  const descriptionRaw = formData.get("description");
  const description = descriptionRaw
    ? descriptionRaw.toString().trim() || null
    : null;

  if (!keyId) {
    throw new Error("Missing translation key identifier");
  }

  if (!defaultText) {
    throw new Error("Default text cannot be empty");
  }

  await updateTranslationDefaultText({
    keyId,
    defaultText,
    description,
  });

  await invalidateTranslationBundleCache();

  await createAuditLogEntry({
    actorId: actor.id,
    action: "translation.default.update",
    target: { translationKeyId: keyId },
    metadata: {
      defaultTextSnippet: defaultText.slice(0, 100),
    },
  });

  revalidatePath(TRANSLATIONS_PATH);
}

export async function saveTranslationValueAction(formData: FormData) {
  const actor = await requireAdminUser();

  const keyId = normalizeText(formData.get("keyId"));
  const languageCode = normalizeText(formData.get("languageCode"));
  const translationValue = formData.get("translationValue")?.toString() ?? "";
  const normalizedValue = translationValue.trim();

  if (!keyId) {
    throw new Error("Missing translation key identifier");
  }

  if (!languageCode) {
    throw new Error("Missing language code");
  }

  const languageOption = await getLanguageByCode(languageCode);
  if (!languageOption) {
    throw new Error("Language not found");
  }

  if (!languageOption.isActive) {
    throw new Error("Language is not active");
  }

  if (normalizedValue) {
    await upsertTranslationValueEntry({
      translationKeyId: keyId,
      languageId: languageOption.id,
      value: normalizedValue,
    });
  } else {
    await deleteTranslationValueEntry({
      translationKeyId: keyId,
      languageId: languageOption.id,
    });
  }

  await invalidateTranslationBundleCache([languageOption.code]);

  await createAuditLogEntry({
    actorId: actor.id,
    action: "translation.value.save",
    target: {
      translationKeyId: keyId,
      languageCode: languageOption.code,
    },
    metadata: {
      snippet: normalizedValue.slice(0, 100),
      cleared: normalizedValue.length === 0,
    },
  });

  revalidatePath(TRANSLATIONS_PATH);
}

export async function publishTranslationsAction() {
  const actor = await requireAdminUser();

  await publishAllTranslations();

  await createAuditLogEntry({
    actorId: actor.id,
    action: "translation.publish",
    target: { type: "all-translations" },
  });

  revalidatePath(TRANSLATIONS_PATH);
  revalidatePath("/recharge");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/translations");
}
