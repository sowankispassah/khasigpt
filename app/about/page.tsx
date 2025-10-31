import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageUserMenu } from "@/components/page-user-menu";
import { DEFAULT_ABOUT_US } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "About KhasiGPT",
  description:
    "Learn about the KhasiGPT team, mission, and how to reach out to us.",
};

export default async function AboutPage() {
  const stored = await getAppSetting<string>("aboutUsContent");
  const content =
    stored && stored.trim().length > 0 ? stored.trim() : DEFAULT_ABOUT_US;

  return (
    <>
      <PageUserMenu />
      <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-10 px-6 py-12 md:py-16">
        <div>
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
            href="/"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>

        <header className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            About KhasiGPT
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            We build AI tools that understand Khasi culture, language, and the
            people who use them every day.
          </p>
        </header>
  
        <section className="space-y-4 text-sm leading-7 text-muted-foreground md:text-base md:leading-8">
          {renderAboutContent(content)}
        </section>
  
        <section
          id="contact"
          className="rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold">Contact the team</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Share feedback, partnership ideas, or support questions. We usually
            reply within one working day.
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

