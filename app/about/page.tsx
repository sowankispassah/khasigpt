import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";

import { DEFAULT_ABOUT_US } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationBundle, registerTranslationKeys } from "@/lib/i18n/dictionary";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "About KhasiGPT",
  description:
    "Learn about the KhasiGPT team, mission, and how to reach out to us.",
};

export default async function AboutPage() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const stored = await getAppSetting<string>("aboutUsContent");
  const storedByLanguage = await getAppSetting<Record<string, string>>("aboutUsContentByLanguage");
  const englishContent =
    stored && stored.trim().length > 0 ? stored.trim() : DEFAULT_ABOUT_US;

  void registerTranslationKeys([
    {
      key: "navigation.back_to_home",
      defaultText: "Back to home",
    },
    {
      key: "about.title",
      defaultText: "About KhasiGPT",
    },
    {
      key: "about.subtitle",
      defaultText:
        "We build AI assistance that understand Khasi culture, language, and the people who use them every day.",
    },
    {
      key: "contact.form.heading",
      defaultText: "Contact the team",
    },
    {
      key: "contact.form.caption",
      defaultText:
        "Share feedback, partnership ideas, or support questions. We usually reply within one working day.",
    },
  ]);
  const { dictionary, activeLanguage, languages } = await getTranslationBundle(preferredLanguage);

  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;

  const normalizedAboutMap: Record<string, string> = {};
  if (
    storedByLanguage &&
    typeof storedByLanguage === "object" &&
    !Array.isArray(storedByLanguage)
  ) {
    for (const [code, value] of Object.entries(storedByLanguage)) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedAboutMap[code] = value.trim();
      }
    }
  }

  const defaultLanguage =
    languages.find((language) => language.isDefault) ?? languages[0] ?? null;

  const defaultLanguageContent = defaultLanguage
    ? normalizedAboutMap[defaultLanguage.code]
    : undefined;

  const localizedContent = normalizedAboutMap[activeLanguage.code];

  const content =
    (localizedContent && localizedContent.trim().length > 0
      ? localizedContent
      : defaultLanguageContent && defaultLanguageContent.trim().length > 0
        ? defaultLanguageContent
        : englishContent) ?? englishContent;

  return (
    <>
      <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-10 px-6 py-12 md:py-16">
        <div>
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
            href="/"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("navigation.back_to_home", "Back to home")}
          </Link>
        </div>

        <header className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {t("about.title", "About KhasiGPT")}
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            {t(
              "about.subtitle",
              "We build AI assistance that understand Khasi culture, language, and the people who use them every day."
            )}
          </p>
        </header>
  
        <section className="space-y-4 text-sm leading-7 text-muted-foreground md:text-base md:leading-8">
          {renderAboutContent(content)}
        </section>
  
        <section
          id="contact"
          className="rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold">
            {t("contact.form.heading", "Contact the team")}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {t(
              "contact.form.caption",
              "Share feedback, partnership ideas, or support questions. We usually reply within one working day."
            )}
          </p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </section>
      </div>
    </>
  );
}

function renderAboutContent(content: string) {
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
