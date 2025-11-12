import type { Metadata } from "next";
import { cookies } from "next/headers";

import { DEFAULT_ABOUT_US } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { ContactForm } from "./contact-form";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { JsonLd } from "@/components/json-ld";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://khasigpt.com";
const aboutUrl = `${siteUrl}/about`;

export const metadata: Metadata = {
  title: "About KhasiGPT | Khasi Language AI Mission & Team",
  description:
    "Discover the KhasiGPT mission, meet the team building Khasi-first AI assistance, and learn the best ways to contact us for partnerships or support.",
  alternates: {
    canonical: "/about",
  },
  keywords: [
    "KhasiGPT team",
    "Khasi AI mission",
    "Khasi technology",
    "Khasi language assistant",
    "Khasi contact",
  ],
  openGraph: {
    type: "website",
    url: aboutUrl,
    title: "Meet KhasiGPT – The Khasi Language AI Team",
    description:
      "KhasiGPT blends culture and AI to help Khasi speakers write, translate, and explore ideas confidently.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "KhasiGPT About Page",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About KhasiGPT",
    description:
      "Learn about the KhasiGPT mission, the people behind it, and how to reach us.",
    images: ["/opengraph-image.png"],
  },
};

export default async function AboutPage() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const stored = await getAppSetting<string>("aboutUsContent");
  const storedByLanguage = await getAppSetting<Record<string, string>>("aboutUsContentByLanguage");
  const englishContent =
    stored && stored.trim().length > 0 ? stored.trim() : DEFAULT_ABOUT_US;

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
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: siteUrl,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "About",
              item: aboutUrl,
            },
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is KhasiGPT?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "KhasiGPT is an AI assistant that understands Khasi language and culture, helping people write, translate, and brainstorm ideas with reliable context.",
              },
            },
            {
              "@type": "Question",
              name: "Who can use KhasiGPT?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "KhasiGPT is built for Khasi speakers everywhere—including students, professionals, and creators—so anyone looking for Khasi-first AI help can use it.",
              },
            },
            {
              "@type": "Question",
              name: "How can I contact the KhasiGPT team?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "The fastest way is the contact form on this page. Share your feedback, partnership ideas, or support needs and the team will reply within one business day.",
              },
            },
          ],
        }}
      />
      <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-10 px-6 py-12 md:py-16">
        <div>
          <BackToHomeButton label={t("navigation.back_to_home", "Back to home")} />
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
