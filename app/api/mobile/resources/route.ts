import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  DEFAULT_ABOUT_US,
  DEFAULT_PRIVACY_POLICY,
  DEFAULT_TERMS_OF_SERVICE,
} from "@/lib/constants";
import {
  getAppSetting,
  getLastKnownAppSetting,
} from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESOURCE_TIMEOUT_MS = 15_000;

type LocalizedContentMap = Record<string, string>;

async function safeAppSetting<T>(key: string, fallback: T) {
  try {
    const value = (await withTimeout(
      getAppSetting<T>(key),
      RESOURCE_TIMEOUT_MS
    )) ?? fallback;
    return { degraded: false, value };
  } catch (error) {
    console.error(`[api/mobile/resources] Failed to load ${key}.`, error);
    return {
      degraded: true,
      value: getLastKnownAppSetting<T>(key) ?? fallback,
    };
  }
}

function normalizeLocalizedContent(value: unknown) {
  const normalized: LocalizedContentMap = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalized;
  }

  for (const [code, content] of Object.entries(value)) {
    if (typeof content === "string" && content.trim().length > 0) {
      normalized[code] = content.trim();
    }
  }
  return normalized;
}

function resolveLocalizedContent({
  activeLanguageCode,
  defaultLanguageCode,
  fallback,
  localized,
}: {
  activeLanguageCode: string;
  defaultLanguageCode: string | null;
  fallback: string;
  localized: LocalizedContentMap;
}) {
  const activeContent = localized[activeLanguageCode];
  if (activeContent?.trim()) {
    return activeContent.trim();
  }

  const defaultContent = defaultLanguageCode
    ? localized[defaultLanguageCode]
    : null;
  if (defaultContent?.trim()) {
    return defaultContent.trim();
  }

  return fallback;
}

function pickTranslations(dictionary: Record<string, string>) {
  const keys = [
    "about.title",
    "about.subtitle",
    "contact.form.heading",
    "contact.form.caption",
    "contact.form.field.name",
    "contact.form.placeholder.name",
    "contact.form.field.email",
    "contact.form.placeholder.email",
    "contact.form.field.phone",
    "contact.form.placeholder.phone",
    "contact.form.field.subject",
    "contact.form.placeholder.subject",
    "contact.form.field.message",
    "contact.form.placeholder.message",
    "contact.form.submit.sending",
    "contact.form.submit.default",
    "contact.form.submit.error_generic",
    "contact.form.submit.success",
    "legal.privacy.title",
    "legal.terms.title",
    "legal.last_updated_prefix",
    "navigation.back",
  ];

  return Object.fromEntries(
    keys
      .map((key) => [key, dictionary[key]] as const)
      .filter(([, value]) => typeof value === "string" && value.trim())
  );
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const { searchParams } = new URL(request.url);
  const requestedLanguage = searchParams.get("lang")?.trim().toLowerCase() ?? null;
  const preferredLanguage = requestedLanguage || cookieStore.get("lang")?.value || null;

  const [
    translationBundle,
    aboutContent,
    aboutByLanguage,
    privacyPolicy,
    privacyByLanguage,
    termsOfService,
    termsByLanguage,
  ] = await Promise.all([
    getTranslationBundle(preferredLanguage),
    safeAppSetting<string>("aboutUsContent", DEFAULT_ABOUT_US),
    safeAppSetting<Record<string, string>>("aboutUsContentByLanguage", {}),
    safeAppSetting<string>("privacyPolicy", DEFAULT_PRIVACY_POLICY),
    safeAppSetting<Record<string, string>>("privacyPolicyByLanguage", {}),
    safeAppSetting<string>("termsOfService", DEFAULT_TERMS_OF_SERVICE),
    safeAppSetting<Record<string, string>>("termsOfServiceByLanguage", {}),
  ]);
  const degradedSettings = [
    aboutContent.degraded ? "aboutUsContent" : null,
    aboutByLanguage.degraded ? "aboutUsContentByLanguage" : null,
    privacyPolicy.degraded ? "privacyPolicy" : null,
    privacyByLanguage.degraded ? "privacyPolicyByLanguage" : null,
    termsOfService.degraded ? "termsOfService" : null,
    termsByLanguage.degraded ? "termsOfServiceByLanguage" : null,
  ].filter((key): key is string => Boolean(key));

  const { activeLanguage, languages, dictionary } = translationBundle;
  const defaultLanguage =
    languages.find((language) => language.isDefault) ?? languages[0] ?? null;
  const defaultLanguageCode = defaultLanguage?.code ?? null;
  const year = new Date().getFullYear();

  return NextResponse.json({
    meta: {
      degraded: degradedSettings.length > 0,
      degradedSettings,
    },
    translations: pickTranslations(dictionary),
    about: {
      title: dictionary["about.title"] ?? "About KhasiGPT",
      subtitle:
        dictionary["about.subtitle"] ??
        "We build AI assistance that understand Khasi culture, language, and the people who use them every day.",
      content: resolveLocalizedContent({
        activeLanguageCode: activeLanguage.code,
        defaultLanguageCode,
        fallback: aboutContent.value?.trim() || DEFAULT_ABOUT_US,
        localized: normalizeLocalizedContent(aboutByLanguage.value),
      }),
    },
    contact: {
      title: dictionary["contact.form.heading"] ?? "Contact the team",
      caption:
        dictionary["contact.form.caption"] ??
        "Share feedback, partnership ideas, or support questions. We usually reply within one working day.",
    },
    privacyPolicy: {
      brand: "Khasigpt",
      title: dictionary["legal.privacy.title"] ?? "Privacy Policy",
      lastUpdatedLabel: `${
        dictionary["legal.last_updated_prefix"] ?? "Last updated"
      }: ${year}`,
      content: resolveLocalizedContent({
        activeLanguageCode: activeLanguage.code,
        defaultLanguageCode,
        fallback: privacyPolicy.value?.trim() || DEFAULT_PRIVACY_POLICY,
        localized: normalizeLocalizedContent(privacyByLanguage.value),
      }),
    },
    termsOfService: {
      brand: "Khasigpt",
      title: dictionary["legal.terms.title"] ?? "Terms of Service",
      lastUpdatedLabel: `${
        dictionary["legal.last_updated_prefix"] ?? "Last updated"
      }: ${year}`,
      content: resolveLocalizedContent({
        activeLanguageCode: activeLanguage.code,
        defaultLanguageCode,
        fallback: termsOfService.value?.trim() || DEFAULT_TERMS_OF_SERVICE,
        localized: normalizeLocalizedContent(termsByLanguage.value),
      }),
    },
  });
}
