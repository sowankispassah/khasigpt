import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { EditableMarkdownContent } from "@/components/editable-markdown-content";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { DEFAULT_REFUND_POLICY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy",
  description:
    "How Khasigpt plan payments, cancellations, and refunds work.",
};

export default async function RefundPolicyPage() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [stored, storedByLanguage, { activeLanguage, languages }] =
    await Promise.all([
      getAppSetting<string>("refundPolicy").catch(() => null),
      getAppSetting<Record<string, string>>("refundPolicyByLanguage").catch(
        () => null
      ),
      getTranslationBundle(preferredLanguage),
    ]);
  const englishContent =
    stored && stored.trim().length > 0 ? stored.trim() : DEFAULT_REFUND_POLICY;

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
  const resolvedContent =
    normalizedContentByLanguage[activeLanguage.code] ??
    (defaultLanguage
      ? normalizedContentByLanguage[defaultLanguage.code]
      : undefined) ??
    englishContent;

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
            defaultText="Refund and Cancellation Policy"
            translationKey="legal.refund.title"
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
        resource="refundPolicy"
      />
    </div>
  );
}
