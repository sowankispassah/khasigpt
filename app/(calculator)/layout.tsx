import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
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
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  getFallbackTranslationBundle,
  getTranslationBundle,
} from "@/lib/i18n/dictionary";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { parseTranslateAccessModeSetting } from "@/lib/translate/config";
import { withTimeout } from "@/lib/utils/async";

const CALCULATOR_LAYOUT_FEATURE_ACCESS_TIMEOUT_MS = 2_000;
const CALCULATOR_LAYOUT_TRANSLATION_TIMEOUT_MS = 1_500;
const CALCULATOR_LAYOUT_FEATURE_ACCESS_KEYS = [
  CALCULATOR_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
] as const;

export default async function CalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cookieStore, session] = await Promise.all([cookies(), auth()]);

  if (!session?.user) {
    redirect("/login?callbackUrl=/calculator");
  }

  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [translationBundle, featureAccessSettings] = await Promise.all([
    withTimeout(
      getTranslationBundle(preferredLanguage),
      CALCULATOR_LAYOUT_TRANSLATION_TIMEOUT_MS,
      () => {
        console.error("[calculator/layout] Translation bundle timed out.", {
          timeoutMs: CALCULATOR_LAYOUT_TRANSLATION_TIMEOUT_MS,
        });
      }
    ).catch((error) => {
      console.error(
        "[calculator/layout] Translation bundle failed. Using static fallback.",
        error
      );
      return getFallbackTranslationBundle(preferredLanguage);
    }),
    loadFeatureAccessSettingsByKeys(CALCULATOR_LAYOUT_FEATURE_ACCESS_KEYS, {
      source: "calculator.layout.feature-access",
      timeoutMs: CALCULATOR_LAYOUT_FEATURE_ACCESS_TIMEOUT_MS,
    }),
  ]);

  const featureAccessUnavailable = featureAccessSettings.status === "unavailable";
  const getFeatureSetting = (key: string) => {
    const value = getFeatureAccessModeSettingValue(featureAccessSettings, key);
    if (value !== undefined) {
      return value;
    }
    return featureAccessUnavailable ? "enabled" : null;
  };

  const calculatorSetting = getFeatureSetting(CALCULATOR_FEATURE_FLAG_KEY);
  const jobsSetting = getFeatureSetting(JOBS_FEATURE_FLAG_KEY);
  const studyModeSetting = getFeatureSetting(STUDY_MODE_FEATURE_FLAG_KEY);
  const translateSetting = getFeatureSetting(TRANSLATE_FEATURE_FLAG_KEY);

  const calculatorEnabled = isFeatureEnabledForRole(
    parseCalculatorAccessModeSetting(calculatorSetting),
    session.user.role
  );

  if (!calculatorEnabled) {
    notFound();
  }

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
  const { languages, activeLanguage, dictionary } = translationBundle;
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarState !== "false";

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      forumEnabled={true}
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
