import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteShell } from "@/components/site-shell";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { parseCalculatorAccessModeSetting } from "@/lib/calculator/config";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { getUserById } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  getFallbackTranslationBundle,
  getTranslationBundle,
} from "@/lib/i18n/dictionary";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import { loadFeatureAccessSettingsByKeys } from "@/lib/settings/feature-access-settings";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { parseTranslateAccessModeSetting } from "@/lib/translate/config";
import { withTimeout } from "@/lib/utils/async";
import { auth } from "../(auth)/auth";

const CHAT_LAYOUT_FEATURE_ACCESS_TIMEOUT_MS = 2_000;
const CHAT_LAYOUT_PROFILE_TIMEOUT_MS = 1_500;
const CHAT_LAYOUT_TRANSLATION_TIMEOUT_MS = 1_500;
const CHAT_LAYOUT_FEATURE_ACCESS_KEYS = [
  STUDY_MODE_FEATURE_FLAG_KEY,
  CALCULATOR_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
] as const;

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const profileUser = session?.user ?? null;
  const needsProfileDetails = Boolean(
    profileUser &&
      (!profileUser.dateOfBirth ||
        !profileUser.firstName ||
        !profileUser.lastName)
  );
  const profileDetailsPromise =
    profileUser && needsProfileDetails
      ? withTimeout(
          getUserById(profileUser.id),
          CHAT_LAYOUT_PROFILE_TIMEOUT_MS,
          () => {
            console.error("[chat/layout] Profile completion lookup timed out.", {
              timeoutMs: CHAT_LAYOUT_PROFILE_TIMEOUT_MS,
            });
          }
        ).catch((error) => {
          console.error(
            "[chat/layout] Profile completion lookup failed. Allowing chat shell.",
            error
          );
          return undefined;
        })
      : Promise.resolve(null);
  const translationBundlePromise = withTimeout(
    getTranslationBundle(preferredLanguage),
    CHAT_LAYOUT_TRANSLATION_TIMEOUT_MS,
    () => {
      console.error("[chat/layout] Translation bundle timed out.", {
        timeoutMs: CHAT_LAYOUT_TRANSLATION_TIMEOUT_MS,
      });
    }
  ).catch((error) => {
    console.error(
      "[chat/layout] Translation bundle failed. Using static fallback.",
      error
    );
    return getFallbackTranslationBundle(preferredLanguage);
  });
  const featureAccessSettingsPromise = session
    ? loadFeatureAccessSettingsByKeys(CHAT_LAYOUT_FEATURE_ACCESS_KEYS, {
        source: "chat.layout.feature-access",
        timeoutMs: CHAT_LAYOUT_FEATURE_ACCESS_TIMEOUT_MS,
      })
    : Promise.resolve(null);

  const [dbUser, translationBundle, featureAccessSettings] = await Promise.all([
    profileDetailsPromise,
    translationBundlePromise,
    featureAccessSettingsPromise,
  ]);

  if (profileUser && needsProfileDetails && dbUser) {
    const hasCompletedProfile = Boolean(
      (dbUser.dateOfBirth ?? profileUser.dateOfBirth) &&
        (dbUser.firstName ?? profileUser.firstName) &&
        (dbUser.lastName ?? profileUser.lastName)
    );
    if (!hasCompletedProfile) {
      redirect("/complete-profile");
    }
  }

  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarState !== "false";
  const { languages, activeLanguage, dictionary } = translationBundle;
  const featureAccessUnavailable =
    featureAccessSettings?.status === "unavailable";
  const getFeatureSetting = (key: string) => {
    const value = featureAccessSettings?.values.get(key);
    if (value !== undefined) {
      return value;
    }
    // Sidebar visibility is not an authorization boundary. If the feature
    // settings read is temporarily unavailable, keep the app shell usable
    // instead of hiding every optional feature until a warm retry succeeds.
    return featureAccessUnavailable ? "enabled" : null;
  };
  const studyModeSetting = getFeatureSetting(STUDY_MODE_FEATURE_FLAG_KEY);
  const calculatorSetting = getFeatureSetting(CALCULATOR_FEATURE_FLAG_KEY);
  const jobsSetting = getFeatureSetting(JOBS_FEATURE_FLAG_KEY);
  const translateSetting = getFeatureSetting(TRANSLATE_FEATURE_FLAG_KEY);
  const studyModeAccessMode = parseStudyModeAccessModeSetting(studyModeSetting);
  const studyModeEnabled = isFeatureEnabledForRole(
    studyModeAccessMode,
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
  const translateAccessMode = parseTranslateAccessModeSetting(translateSetting);
  const translateEnabled = isFeatureEnabledForRole(
    translateAccessMode,
    session?.user?.role ?? null
  );

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      forumEnabled={true}
      languages={languages}
      session={session ?? null}
    >
      {session ? (
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
      ) : (
        children
      )}
    </SiteShell>
  );
}
