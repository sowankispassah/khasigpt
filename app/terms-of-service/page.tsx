import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { DEFAULT_TERMS_OF_SERVICE } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationsForKeys } from "@/lib/i18n/dictionary";
import { resolveLanguage } from "@/lib/i18n/languages";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Understand the terms and conditions that govern your use of Khasigpt.",
};

export default async function TermsOfServicePage() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const stored = await getAppSetting<string>("termsOfService");
  const storedByLanguage = await getAppSetting<Record<string, string>>(
    "termsOfServiceByLanguage"
  );
  const englishContent =
    stored && stored.trim().length > 0
      ? stored.trim()
      : DEFAULT_TERMS_OF_SERVICE;
  const { activeLanguage, languages } = await resolveLanguage(preferredLanguage);

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

  const translations = await getTranslationsForKeys(preferredLanguage, [
    {
      key: "navigation.back_to_home",
      defaultText: "Back to home",
    },
    {
      key: "legal.terms.title",
      defaultText: "Terms of Service",
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
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
            href="/"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {translations["navigation.back_to_home"] ?? "Back to home"}
          </Link>
        </div>

        <header className="space-y-2">
          <p className="text-sm font-medium text-primary">Khasigpt</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {translations["legal.terms.title"] ?? "Terms of Service"}
          </h1>
          <p className="text-muted-foreground">
            {(translations["legal.last_updated_prefix"] ?? "Last updated") +
              `: ${new Date().getFullYear()}`}
          </p>
        </header>

        <section className="space-y-4 text-sm leading-7 text-muted-foreground md:text-base md:leading-8">
          {renderLegalContent(resolvedContent)}
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
        <p key={`paragraph-${index}`}>{block.replace(/\n+/g, " ")}</p>
      );
    });
}
