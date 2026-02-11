import { notFound } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { SiteShell } from "@/components/site-shell";
import { FORUM_FEATURE_FLAG_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { parseForumAccessModeSetting } from "@/lib/forum/config";
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

  const [translationBundle, session, forumSetting] = await Promise.all([
    getTranslationBundle(requested),
    auth(),
    getAppSetting<string | boolean>(FORUM_FEATURE_FLAG_KEY),
  ]);
  const { languages, activeLanguage, dictionary } = translationBundle;

  if (activeLanguage.code !== requested) {
    notFound();
  }
  const forumEnabled = isFeatureEnabledForRole(
    parseForumAccessModeSetting(forumSetting),
    session?.user?.role ?? null
  );

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      forumEnabled={forumEnabled}
      languages={languages}
      session={session ?? null}
    >
      {children}
    </SiteShell>
  );
}
