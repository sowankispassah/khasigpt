import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { EditableMarkdownContent } from "@/components/editable-markdown-content";
import { JsonLd } from "@/components/json-ld";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { DEFAULT_ABOUT_US } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { ContactForm } from "./contact-form";

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
  const stored = await getAppSetting<string>("aboutUsContent").catch(() => null);
  const storedByLanguage = await getAppSetting<Record<string, string>>(
    "aboutUsContentByLanguage"
  ).catch(() => null);
  const englishContent =
    stored && stored.trim().length > 0 ? stored.trim() : DEFAULT_ABOUT_US;

  const { dictionary, activeLanguage, languages } =
    await getTranslationBundle(preferredLanguage);

  const contactTranslations = pickContactTranslations(dictionary);

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
          <BackToHomeButton
            href="/"
            label="Back"
            translationKey="navigation.back"
          />
        </div>

        <header className="space-y-3 text-center md:text-left">
          <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
            <EditableTranslation
              defaultText="About KhasiGPT"
              translationKey="about.title"
            />
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            <EditableTranslation
              defaultText="We build AI assistance that understand Khasi culture, language, and the people who use them every day."
              translationKey="about.subtitle"
            />
          </p>
        </header>

        <EditableMarkdownContent
          className="space-y-4 text-muted-foreground text-sm leading-7 md:text-base md:leading-8"
          content={content}
          paragraphClassName="whitespace-normal"
          resource="about"
        />

        <section
          className="rounded-xl border border-border bg-card p-6 shadow-sm"
          id="contact"
        >
          <h2 className="font-semibold text-xl">
            <EditableTranslation
              defaultText="Contact the team"
              translationKey="contact.form.heading"
            />
          </h2>
          <p className="mt-2 text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="Share feedback, partnership ideas, or support questions. We usually reply within one working day."
              translationKey="contact.form.caption"
            />
          </p>
          <div className="mt-6">
            <ContactForm translations={contactTranslations} />
          </div>
          <div className="mt-6 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
            <h3 className="font-semibold text-base text-destructive">
              <EditableTranslation
                defaultText="Need to remove your account data?"
                translationKey="contact.delete_account.title"
              />
            </h3>
            <p className="mt-1 text-muted-foreground text-sm">
              <EditableTranslation
                defaultText="For account and personal data deletion, use the dedicated request form so we can verify ownership and give you a reference ID."
                translationKey="contact.delete_account.description"
              />
            </p>
            <Link
              className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-md border border-destructive/40 px-3 py-2 font-medium text-destructive text-sm transition hover:bg-destructive/10"
              data-nav
              href="/help/delete-account"
            >
              <EditableTranslation
                defaultText="Request account data deletion"
                translationKey="contact.delete_account.button"
              />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

const CONTACT_TRANSLATION_KEYS = [
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
];

function pickContactTranslations(dictionary: Record<string, string>) {
  const entries = CONTACT_TRANSLATION_KEYS.map((key) => [
    key,
    dictionary[key],
  ] as const).filter(([, value]) => typeof value === "string" && value.trim());

  return Object.fromEntries(entries);
}
