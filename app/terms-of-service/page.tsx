import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { JSX } from "react";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { DEFAULT_TERMS_OF_SERVICE } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

const DOUBLE_NEWLINE_REGEX = /\n{2,}/;
const HEADING_REGEX = /^#{1,6}\s/;
const HEADING_PREFIX_REGEX = /^#{1,6}/;
const HEADING_TRIM_REGEX = /^#{1,6}\s*/;
const LIST_ITEM_PREFIX_REGEX = /^-+\s*/;
const MULTILINE_REGEX = /\n+/;

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
  const { activeLanguage, languages, dictionary } =
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

  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-6 py-12 md:gap-8 md:py-16">
      <div>
        <BackToHomeButton
          href="/"
          label={t("navigation.back_to_home", "Back to home")}
        />
      </div>

      <header className="space-y-2">
        <p className="font-medium text-primary text-sm">Khasigpt</p>
        <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
          {t("legal.terms.title", "Terms of Service")}
        </h1>
        <p className="text-muted-foreground">
          {t("legal.last_updated_prefix", "Last updated") +
            `: ${new Date().getFullYear()}`}
        </p>
      </header>

      <section className="space-y-3 text-muted-foreground text-sm leading-6 md:text-base md:leading-7">
        {renderLegalContent(resolvedContent)}
      </section>
    </div>
  );
}

function renderLegalContent(content: string) {
  const blocks = content
    .split(DOUBLE_NEWLINE_REGEX)
    .map((block) => block.trim());

  return blocks.filter(Boolean).map((block, index) => {
    if (HEADING_REGEX.test(block)) {
      const match = block.match(HEADING_PREFIX_REGEX);
      const level = match ? match[0].length : 2;
      const headingText = block.replace(HEADING_TRIM_REGEX, "").trim();
      const HeadingTag =
        `h${Math.min(level + 1, 6)}` as keyof JSX.IntrinsicElements;

      return (
        <HeadingTag
          className="font-semibold text-foreground text-xl"
          key={`heading-${headingText || index}`}
        >
          {headingText}
        </HeadingTag>
      );
    }

    const lines = block.split("\n").map((line) => line.trim());
    const isList = lines.every((line) => line.startsWith("- "));

    if (isList) {
      const listKey = `list-${lines.join("|").slice(0, 32) || index}`;
      return (
        <ul className="list-disc space-y-2 pl-5" key={listKey}>
          {lines.map((line, itemIndex) => (
            <li key={`list-item-${listKey}-${itemIndex}-${line}`}>
              {line.replace(LIST_ITEM_PREFIX_REGEX, "")}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p
        className="whitespace-pre-line"
        key={`paragraph-${block.slice(0, 32) || index}`}
      >
        {block.replace(MULTILINE_REGEX, " ")}
      </p>
    );
  });
}
