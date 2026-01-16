import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { getActiveLanguages } from "@/lib/i18n/languages";

export const dynamicParams = false;

export async function generateStaticParams() {
  try {
    const languages = await getActiveLanguages();
    return languages.map((language) => ({ lang: language.code }));
  } catch {
    return [{ lang: "en" }];
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const requested = lang?.trim().toLowerCase();

  if (!requested) {
    notFound();
  }

  const { languages, activeLanguage, dictionary } =
    await getTranslationBundle(requested);

  if (activeLanguage.code !== requested) {
    notFound();
  }

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      languages={languages}
    >
      {children}
    </SiteShell>
  );
}
