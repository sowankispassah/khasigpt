import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { EditableMarkdownContent } from "@/components/editable-markdown-content";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { DEFAULT_TERMS_OF_SERVICE } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Understand the terms and conditions that govern your use of Khasigpt.",
};

export default async function TermsOfServicePage() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const stored = await getAppSetting<string>("termsOfService").catch(() => null);
  const storedByLanguage = await getAppSetting<Record<string, string>>(
    "termsOfServiceByLanguage"
  ).catch(() => null);
  const englishContent =
    stored && stored.trim().length > 0
      ? stored.trim()
      : DEFAULT_TERMS_OF_SERVICE;
  const { activeLanguage, languages } =
    await getTranslationBundle(preferredLanguage);

  const normalizedContentByLanguage: Record<string, string> = {};
  if (
    storedByLanguage &&
    typeof storedByLanguage === "object" &&
    !Array.isArray(storedByLanguage)
  ) {
    for (const [code, value] of Object.entries(storedByLanguage)) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedContentByLanguage[code] = value.trim();
      }
    }
  }

  const defaultLanguage =
    languages.find((language) => language.isDefault) ?? languages[0] ?? null;
  const defaultLanguageContent = defaultLanguage
    ? normalizedContentByLanguage[defaultLanguage.code]
    : undefined;
  const localizedContent = normalizedContentByLanguage[activeLanguage.code];
  const resolvedContent =
    (localizedContent && localizedContent.trim().length > 0
      ? localizedContent
      : defaultLanguageContent && defaultLanguageContent.trim().length > 0
        ? defaultLanguageContent
        : englishContent) ?? englishContent;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-6 py-12 md:gap-8 md:py-16">
      <div>
        <BackToHomeButton
          href="/"
          label="Back"
          translationKey="navigation.back"
        />
      </div>

      <header className="space-y-2">
        <p className="font-medium text-primary text-sm">
          <EditableTranslation defaultText="KhasiGPT" translationKey="app.brand" />
        </p>
        <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
          <EditableTranslation
            defaultText="Terms of Service"
            translationKey="legal.terms.title"
          />
        </h1>
        <p className="text-muted-foreground">
          <EditableTranslation
            defaultText="Last updated"
            translationKey="legal.last_updated_prefix"
          />
          {`: ${new Date().getFullYear()}`}
        </p>
      </header>

      <EditableMarkdownContent
        className="space-y-3 text-muted-foreground text-sm leading-6 md:text-base md:leading-7"
        content={resolvedContent}
        resource="termsOfService"
      />
    </div>
  );
}
