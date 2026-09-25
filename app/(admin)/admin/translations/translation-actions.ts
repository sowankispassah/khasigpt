"use server";

import { auth } from "@/app/(auth)/auth";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import {
  createAuditLogEntry,
  deleteTranslationValueEntry,
  updateTranslationDefaultText,
  upsertTranslationValueEntry,
} from "@/lib/db/queries";
import {
  invalidateTranslationBundleCache,
  registerTranslationKeys,
} from "@/lib/i18n/dictionary";
import { getLanguageByCode } from "@/lib/i18n/languages";
import { STATIC_TRANSLATION_DEFINITIONS } from "@/lib/i18n/static-definitions";

const TRANSLATIONS_PATH = "/admin/translations";
const TRANSLATION_AUDIT_TIMEOUT_MS = 3000;

function revalidateTranslationsAdmin(source: string) {
  invalidateAdminMutation({
    paths: [{ path: TRANSLATIONS_PATH }],
    source,
  });
}

async function createAuditLogEntrySafely(
  entry: Parameters<typeof createAuditLogEntry>[0]
) {
  await Promise.race([
    createAuditLogEntry(entry),
    new Promise<null>((resolve) => {
      setTimeout(resolve, TRANSLATION_AUDIT_TIMEOUT_MS, null);
    }),
  ]).catch((error) => {
    console.error(
      `[admin/translations] Audit log write timed out or failed for action "${entry.action}".`,
      error
    );
  });
}

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

  await createAuditLogEntrySafely({
    actorId: actor.id,
    action: "translation.default.update",
    target: { translationKeyId: keyId },
    metadata: {
      defaultTextSnippet: defaultText.slice(0, 100),
    },
  });

  revalidateTranslationsAdmin("translation.default.update");
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

  await createAuditLogEntrySafely({
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

  revalidateTranslationsAdmin("translation.value.save");
}

export async function publishTranslationsAction() {
  const actor = await requireAdminUser();

  await registerTranslationKeys(STATIC_TRANSLATION_DEFINITIONS);
  await invalidateTranslationBundleCache();

  await createAuditLogEntrySafely({
    actorId: actor.id,
    action: "translation.publish",
    target: { type: "all-translations" },
  });

  revalidateTranslationsAdmin("translation.publish");
}
