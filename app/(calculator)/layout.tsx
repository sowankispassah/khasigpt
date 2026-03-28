import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteShell } from "@/components/site-shell";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { parseCalculatorAccessModeSetting } from "@/lib/calculator/config";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  FORUM_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { parseForumAccessModeSetting } from "@/lib/forum/config";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { parseTranslateAccessModeSetting } from "@/lib/translate/config";

export default async function CalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [
    cookieStore,
    session,
    calculatorSetting,
    forumSetting,
    jobsSetting,
    studyModeSetting,
    translateSetting,
  ] = await Promise.all([
      cookies(),
      auth(),
      getAppSetting<string | boolean | number>(CALCULATOR_FEATURE_FLAG_KEY),
      getAppSetting<string | boolean>(FORUM_FEATURE_FLAG_KEY),
      getAppSetting<string | boolean>(JOBS_FEATURE_FLAG_KEY),
      getAppSetting<string | boolean>(STUDY_MODE_FEATURE_FLAG_KEY),
      getAppSetting<string | boolean>(TRANSLATE_FEATURE_FLAG_KEY),
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
  const jobsModeEnabled = isFeatureEnabledForRole(
    parseJobsAccessModeSetting(jobsSetting),
    session.user.role
  );
  const studyModeEnabled = isFeatureEnabledForRole(
    parseStudyModeAccessModeSetting(studyModeSetting),
    session.user.role
  );
  const translateEnabled = isFeatureEnabledForRole(
    parseTranslateAccessModeSetting(translateSetting),
    session.user.role
  );
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarState !== "false";

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      forumEnabled={forumEnabled}
      languages={languages}
      session={session}
    >
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AppSidebar
          calculatorEnabled={calculatorEnabled}
          jobsModeEnabled={jobsModeEnabled}
          studyModeEnabled={studyModeEnabled}
          translateEnabled={translateEnabled}
          user={session.user}
        />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </SiteShell>
  );
}
