import type { JSX } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { DEFAULT_PRIVACY_POLICY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationBundle, getTranslationsForKeys } from "@/lib/i18n/dictionary";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Khasigpt collects, uses, and protects your personal information.",
};

export default async function PrivacyPolicyPage() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const stored = await getAppSetting<string>("privacyPolicy");
  const storedByLanguage = await getAppSetting<Record<string, string>>(
    "privacyPolicyByLanguage"
  );
  const englishContent =
    stored && stored.trim().length > 0 ? stored.trim() : DEFAULT_PRIVACY_POLICY;
  const { activeLanguage, languages } = await getTranslationBundle(preferredLanguage);

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
  const content =
    (localizedContent && localizedContent.trim().length > 0
      ? localizedContent
      : defaultLanguageContent && defaultLanguageContent.trim().length > 0
        ? defaultLanguageContent
        : englishContent) ?? englishContent;

  const translations = await getTranslationsForKeys(preferredLanguage, [
    {
      key: "navigation.back_to_home",
      defaultText: "Back to home",
    },
    {
      key: "legal.privacy.title",
      defaultText: "Privacy Policy",
    },
    {
      key: "legal.last_updated_prefix",
      defaultText: "Last updated",
    },
  ]);

  return (
    <>
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-6 py-12 md:gap-8 md:py-16">
        <div>
          <BackToHomeButton
            label={translations["navigation.back_to_home"] ?? "Back to home"}
          />
        </div>

        <header className="space-y-2">
          <p className="text-sm font-medium text-primary">Khasigpt</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {translations["legal.privacy.title"] ?? "Privacy Policy"}
          </h1>
          <p className="text-muted-foreground">
            {(translations["legal.last_updated_prefix"] ?? "Last updated") +
              `: ${new Date().getFullYear()}`}
          </p>
        </header>

        <section className="space-y-3 text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
          {renderLegalContent(content)}
        </section>
      </div>
    </>
  );
}

function renderLegalContent(content: string) {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim());

  return blocks
    .filter(Boolean)
    .map((block, index) => {
      if (/^#{1,6}\s/.test(block)) {
        const match = block.match(/^#{1,6}/);
        const level = match ? match[0].length : 2;
        const headingText = block.replace(/^#{1,6}\s*/, "").trim();
        const HeadingTag = `h${Math.min(level + 1, 6)}` as keyof JSX.IntrinsicElements;

        return (
          <HeadingTag
            className="text-xl font-semibold text-foreground"
            key={`heading-${index}`}
          >
            {headingText}
          </HeadingTag>
        );
      }

      const lines = block.split("\n").map((line) => line.trim());
      const isList = lines.every((line) => line.startsWith("- "));

      if (isList) {
        return (
          <ul className="list-disc space-y-2 pl-5" key={`list-${index}`}>
            {lines.map((line, itemIndex) => (
              <li key={`list-item-${index}-${itemIndex}`}>
                {line.replace(/^-+\s*/, "")}
              </li>
            ))}
          </ul>
        );
      }

      return (
        <p className="whitespace-pre-line" key={`paragraph-${index}`}>
          {block}
        </p>
      );
    });
}
