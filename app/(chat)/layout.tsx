import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPreloader } from "@/components/chat-preloader";
import { JobsAutoScrapeTrigger } from "@/components/jobs-auto-scrape-trigger";
import { SiteShell } from "@/components/site-shell";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  FORUM_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { parseCalculatorAccessModeSetting } from "@/lib/calculator/config";
import { getAppSetting, getUserById } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { parseForumAccessModeSetting } from "@/lib/forum/config";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { withTimeout } from "@/lib/utils/async";
import { auth } from "../(auth)/auth";

const profileLookupTimeoutRaw = Number.parseInt(
  process.env.PROFILE_LOOKUP_TIMEOUT_MS ?? "1200",
  10
);
const PROFILE_LOOKUP_TIMEOUT_MS =
  Number.isFinite(profileLookupTimeoutRaw) && profileLookupTimeoutRaw > 0
    ? profileLookupTimeoutRaw
    : 1200;
const CHAT_LAYOUT_QUERY_TIMEOUT_MS = 8_000;

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const profileUser = session?.user ?? null;

  if (profileUser) {
    const needsProfileDetails =
      !profileUser.dateOfBirth ||
      !profileUser.firstName ||
      !profileUser.lastName;
    if (needsProfileDetails) {
      const dbUser = await withTimeout(
        getUserById(profileUser.id),
        PROFILE_LOOKUP_TIMEOUT_MS
      ).catch(() => null);
      const hasCompletedProfile = Boolean(
        (dbUser?.dateOfBirth ?? profileUser.dateOfBirth) &&
          (dbUser?.firstName ?? profileUser.firstName) &&
          (dbUser?.lastName ?? profileUser.lastName)
      );
      if (!hasCompletedProfile) {
        redirect("/complete-profile");
      }
    }
  }

  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarState !== "false";
  const { languages, activeLanguage, dictionary } =
    await getTranslationBundle(preferredLanguage);
  const safeSettingRead = <T,>(label: string, promise: Promise<T>, fallback: T) =>
    withTimeout(promise, CHAT_LAYOUT_QUERY_TIMEOUT_MS).catch((error) => {
      console.error(`[chat/layout] ${label} timed out or failed.`, error);
      return fallback;
    });
  const [studyModeSetting, forumSetting, calculatorSetting, jobsSetting] = session
    ? await Promise.all([
        safeSettingRead(
          "study mode setting",
          getAppSetting<string | boolean>(STUDY_MODE_FEATURE_FLAG_KEY),
          null
        ),
        safeSettingRead(
          "forum setting",
          getAppSetting<string | boolean>(FORUM_FEATURE_FLAG_KEY),
          null
        ),
        safeSettingRead(
          "calculator setting",
          getAppSetting<string | boolean>(CALCULATOR_FEATURE_FLAG_KEY),
          null
        ),
        safeSettingRead(
          "jobs setting",
          getAppSetting<string | boolean>(JOBS_FEATURE_FLAG_KEY),
          null
        ),
      ])
    : [null, null, null, null];
  const studyModeAccessMode = parseStudyModeAccessModeSetting(studyModeSetting);
  const studyModeEnabled = isFeatureEnabledForRole(
    studyModeAccessMode,
    session?.user?.role ?? null
  );
  const forumAccessMode = parseForumAccessModeSetting(forumSetting);
  const forumEnabled = isFeatureEnabledForRole(
    forumAccessMode,
    session?.user?.role ?? null
  );
  const calculatorAccessMode =
    parseCalculatorAccessModeSetting(calculatorSetting);
  const calculatorEnabled = isFeatureEnabledForRole(
    calculatorAccessMode,
    session?.user?.role ?? null
  );
  const jobsAccessMode = parseJobsAccessModeSetting(jobsSetting);
  const jobsModeEnabled = isFeatureEnabledForRole(
    jobsAccessMode,
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
      {session ? (
        <SidebarProvider defaultOpen={defaultSidebarOpen}>
          <JobsAutoScrapeTrigger />
          <ChatPreloader />
          <AppSidebar
            calculatorEnabled={calculatorEnabled}
            jobsModeEnabled={jobsModeEnabled}
            studyModeEnabled={studyModeEnabled}
            user={session.user}
          />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
      ) : (
        children
      )}
    </SiteShell>
  );
}
