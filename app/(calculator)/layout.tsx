import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { SiteShell } from "@/components/site-shell";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  FORUM_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { parseForumAccessModeSetting } from "@/lib/forum/config";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { parseCalculatorAccessModeSetting } from "@/lib/calculator/config";

export default async function CalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cookieStore, session, calculatorSetting, forumSetting] =
    await Promise.all([
      cookies(),
      auth(),
      getAppSetting<string | boolean | number>(CALCULATOR_FEATURE_FLAG_KEY),
      getAppSetting<string | boolean>(FORUM_FEATURE_FLAG_KEY),
    ]);

  if (!session?.user) {
    redirect("/login?callbackUrl=/calculator");
  }

  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const { languages, activeLanguage, dictionary } =
    await getTranslationBundle(preferredLanguage);

  const calculatorEnabled = isFeatureEnabledForRole(
    parseCalculatorAccessModeSetting(calculatorSetting),
    session.user.role
  );

  if (!calculatorEnabled) {
    notFound();
  }

  const forumEnabled = isFeatureEnabledForRole(
    parseForumAccessModeSetting(forumSetting),
    session.user.role
  );

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      forumEnabled={forumEnabled}
      languages={languages}
      session={session}
    >
      {children}
    </SiteShell>
  );
}
