import Link from "next/link";
import { PageUserMenu } from "@/components/page-user-menu";
import type { Metadata } from "next";

import { DEFAULT_PRIVACY_POLICY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Khasigpt collects, uses, and protects your personal information.",
};

export default async function PrivacyPolicyPage() {
  const stored = await getAppSetting<string>("privacyPolicy");
  const content =
    stored && stored.trim().length > 0 ? stored.trim() : DEFAULT_PRIVACY_POLICY;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-6 py-12 md:gap-8 md:py-16">
      <div>
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="/"
        >
          ← Back to home
        </Link>
      </div>

      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Khasigpt</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Privacy Policy
        </h1>
        <p className="text-muted-foreground">
          Last updated: {new Date().getFullYear()}
        </p>
      </header>

      <section className="space-y-4 text-sm leading-7 text-muted-foreground md:text-base md:leading-8">
        {renderLegalContent(content)}
      </section>
    </div>
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
