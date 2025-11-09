import {
  getAppSetting,
  listActiveSubscriptionSummaries,
  listModelConfigs,
  listPricingPlans,
  getTranslationValuesForKeys,
} from "@/lib/db/queries";
import {
  createModelConfigAction,
  deleteModelConfigAction,
  hardDeleteModelConfigAction,
  setDefaultModelConfigAction,
  updateModelConfigAction,
  createPricingPlanAction,
  updatePricingPlanAction,
  deletePricingPlanAction,
  hardDeletePricingPlanAction,
  setRecommendedPricingPlanAction,
  updateAboutContentAction,
  updateSuggestedPromptsAction,
  updatePrivacyPolicyByLanguageAction,
  updateTermsOfServiceByLanguageAction,
  createLanguageAction,
  updateLanguageStatusAction,
  updatePlanTranslationAction,
  updateFreeMessageSettingsAction,
} from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { cn } from "@/lib/utils";
import { AdminSettingsNotice } from "./notice";
import {
  DEFAULT_SUGGESTED_PROMPTS,
  DEFAULT_PRIVACY_POLICY,
  DEFAULT_TERMS_OF_SERVICE,
  DEFAULT_ABOUT_US,
  TOKENS_PER_CREDIT,
  RECOMMENDED_PRICING_PLAN_SETTING_KEY,
  DEFAULT_FREE_MESSAGES_PER_DAY,
} from "@/lib/constants";
import { loadFreeMessageSettings } from "@/lib/free-messages";
import { formatDistanceToNow } from "date-fns";
import { getAllLanguages } from "@/lib/i18n/languages";
import { LanguagePromptsForm } from "./language-prompts-form";
import { LanguageContentForm } from "./language-content-form";

export const dynamic = "force-dynamic";

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "custom", label: "Custom (configure in code)" },
];

function ProviderBadge({ value }: { value: string }) {
  const option = PROVIDER_OPTIONS.find((item) => item.value === value);
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize">
      {option?.label ?? value}
    </span>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Enabled
      </span>
    );
  }
  return (
    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
      Disabled
    </span>
  );
}

type AdminSettingsSearchParams = { notice?: string };

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<AdminSettingsSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const notice = resolvedSearchParams?.notice;

  const [
    modelsRaw,
    plansRaw,
    activeSubscriptions,
    privacyPolicySetting,
    termsOfServiceSetting,
    aboutUsSetting,
    aboutUsContentByLanguageSetting,
    privacyPolicyByLanguageSetting,
    termsOfServiceByLanguageSetting,
    suggestedPromptsSetting,
    suggestedPromptsByLanguageSetting,
    recommendedPlanSetting,
    languages,
    freeMessageSettings,
  ] = await Promise.all([
    listModelConfigs({ includeDisabled: true, includeDeleted: true, limit: 200 }),
    listPricingPlans({ includeInactive: true, includeDeleted: true }),
    listActiveSubscriptionSummaries({ limit: 10 }),
    getAppSetting<string>("privacyPolicy"),
    getAppSetting<string>("termsOfService"),
    getAppSetting<string>("aboutUsContent"),
    getAppSetting<Record<string, string>>("aboutUsContentByLanguage"),
    getAppSetting<Record<string, string>>("privacyPolicyByLanguage"),
    getAppSetting<Record<string, string>>("termsOfServiceByLanguage"),
    getAppSetting<string[]>("suggestedPrompts"),
    getAppSetting<Record<string, string[]>>("suggestedPromptsByLanguage"),
    getAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY),
    getAllLanguages(),
    loadFreeMessageSettings(),
  ]);

  const activeModels = modelsRaw.filter((model) => !model.deletedAt);
  const deletedModels = modelsRaw.filter((model) => model.deletedAt);

  const activePlans = plansRaw.filter((plan) => !plan.deletedAt);
  const deletedPlans = plansRaw.filter((plan) => plan.deletedAt);

  const recommendedPlanId =
    recommendedPlanSetting &&
    activePlans.some((plan) => plan.id === recommendedPlanSetting)
      ? recommendedPlanSetting
      : null;
  const recommendedPlanName = recommendedPlanId
    ? activePlans.find((plan) => plan.id === recommendedPlanId)?.name ?? null
    : null;

  const privacyPolicyContent =
    privacyPolicySetting && privacyPolicySetting.trim().length > 0
      ? privacyPolicySetting
      : DEFAULT_PRIVACY_POLICY;
  const termsOfServiceContent =
    termsOfServiceSetting && termsOfServiceSetting.trim().length > 0
      ? termsOfServiceSetting
      : DEFAULT_TERMS_OF_SERVICE;
  const aboutContent =
    aboutUsSetting && aboutUsSetting.trim().length > 0
      ? aboutUsSetting
      : DEFAULT_ABOUT_US;
  const normalizedAboutContentByLanguage: Record<string, string> = {};
  if (
    aboutUsContentByLanguageSetting &&
    typeof aboutUsContentByLanguageSetting === "object" &&
    !Array.isArray(aboutUsContentByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(aboutUsContentByLanguageSetting)) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedAboutContentByLanguage[code] = value.trim();
      }
    }
  }
  const normalizedPrivacyPolicyByLanguage: Record<string, string> = {};
  if (
    privacyPolicyByLanguageSetting &&
    typeof privacyPolicyByLanguageSetting === "object" &&
    !Array.isArray(privacyPolicyByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(privacyPolicyByLanguageSetting)) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedPrivacyPolicyByLanguage[code] = value.trim();
      }
    }
  }
  const normalizedTermsOfServiceByLanguage: Record<string, string> = {};
  if (
    termsOfServiceByLanguageSetting &&
    typeof termsOfServiceByLanguageSetting === "object" &&
    !Array.isArray(termsOfServiceByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(termsOfServiceByLanguageSetting)) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedTermsOfServiceByLanguage[code] = value.trim();
      }
    }
  }
  const activeLanguagesList = languages.filter((language) => language.isActive);
  const suggestedPromptsList = Array.isArray(suggestedPromptsSetting)
    ? suggestedPromptsSetting.filter(
        (item) => typeof item === "string" && item.trim().length > 0
      )
    : [];
  const suggestedPrompts =
    suggestedPromptsList.length > 0
      ? suggestedPromptsList
      : DEFAULT_SUGGESTED_PROMPTS;
  const normalizedSuggestedPromptsByLanguage: Record<string, string[]> = {};
  if (
    suggestedPromptsByLanguageSetting &&
    typeof suggestedPromptsByLanguageSetting === "object" &&
    !Array.isArray(suggestedPromptsByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(
      suggestedPromptsByLanguageSetting as Record<string, unknown>
    )) {
      if (!Array.isArray(value)) {
        continue;
      }

      const normalized = value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);

      if (normalized.length > 0) {
        normalizedSuggestedPromptsByLanguage[code] = normalized;
      }
    }
  }

  const languagePromptConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedSuggestedPromptsByLanguage[language.code];
    const promptsForLanguage =
      stored && stored.length > 0 ? stored : suggestedPrompts;

    return {
      language,
      prompts: promptsForLanguage,
    };
  });
  const languageAboutConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedAboutContentByLanguage[language.code];
    const contentForLanguage =
      stored && stored.length > 0
        ? stored
        : language.isDefault
          ? aboutContent
          : "";

    return {
      language,
      content: contentForLanguage,
    };
  });
  const languagePrivacyConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedPrivacyPolicyByLanguage[language.code];
    const contentForLanguage =
      stored && stored.length > 0
        ? stored
        : language.isDefault
          ? privacyPolicyContent
          : "";

    return {
      language,
      content: contentForLanguage,
    };
  });

  const isGlobalFreeMessageMode = freeMessageSettings.mode === "global";
  const perModelInputClassName = cn(
    "rounded-md border bg-background px-3 py-2 text-sm",
    isGlobalFreeMessageMode &&
      "cursor-not-allowed bg-muted text-muted-foreground opacity-60"
  );
  const perModelFieldDescription = isGlobalFreeMessageMode
    ? "Managed by the global allowance above."
    : "Complimentary messages per day for this model when a user has no active credits.";
  const languageTermsConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedTermsOfServiceByLanguage[language.code];
    const contentForLanguage =
      stored && stored.length > 0
        ? stored
        : language.isDefault
          ? termsOfServiceContent
          : "";

    return {
      language,
      content: contentForLanguage,
    };
  });

  const planTranslationDefinitions = activePlans.flatMap((plan) => [
    {
      key: `recharge.plan.${plan.id}.name`,
      defaultText: plan.name,
    },
    {
      key: `recharge.plan.${plan.id}.description`,
      defaultText: plan.description ?? "",
    },
  ]);

  const planTranslationKeys = planTranslationDefinitions.map((definition) => definition.key);
  const planTranslationValuesByLanguage =
    planTranslationKeys.length > 0
      ? await getTranslationValuesForKeys(planTranslationKeys)
      : {};

  const planTranslationsByLanguage: Record<
    string,
    Record<string, { name: string; description: string }>
  > = {};

  for (const language of activeLanguagesList) {
    const languageValues = planTranslationValuesByLanguage[language.code] ?? {};
    const planMap: Record<string, { name: string; description: string }> = {};

    for (const plan of activePlans) {
      planMap[plan.id] = {
        name: language.isDefault
          ? plan.name
          : languageValues[`recharge.plan.${plan.id}.name`] ?? "",
        description: language.isDefault
          ? plan.description ?? ""
          : languageValues[`recharge.plan.${plan.id}.description`] ?? "",
      };
    }

    planTranslationsByLanguage[language.code] = planMap;
  }

  return (
    <>
      <AdminSettingsNotice notice={notice} />

      <div className="flex flex-col gap-10">
        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Free message policy</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Choose whether complimentary daily messages come from each model or a single global allowance.
              </p>
            </div>
          </div>
          <form
            action={updateFreeMessageSettingsAction}
            className="mt-6 grid gap-6 md:grid-cols-2"
          >
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Allowance mode</legend>
              <label className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                <input
                  className="mt-1 h-4 w-4"
                  defaultChecked={freeMessageSettings.mode === "per-model"}
                  name="mode"
                  type="radio"
                  value="per-model"
                />
                <span>
                  <span className="font-medium">Per model allowances</span>
                  <br />
                  <span className="text-muted-foreground">
                    Each model can define its own complimentary daily messages.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                <input
                  className="mt-1 h-4 w-4"
                  defaultChecked={freeMessageSettings.mode === "global"}
                  name="mode"
                  type="radio"
                  value="global"
                />
                <span>
                  <span className="font-medium">One limit for all models</span>
                  <br />
                  <span className="text-muted-foreground">
                    Override per-model allowances and use the global value below.
                  </span>
                </span>
              </label>
            </fieldset>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="globalLimit">
                Global daily free messages
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={freeMessageSettings.globalLimit}
                id="globalLimit"
                min={0}
                name="globalLimit"
                step={1}
                type="number"
              />
              <p className="text-muted-foreground text-xs">
                Used only when &ldquo;One limit for all models&rdquo; is selected.
              </p>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <ActionSubmitButton pendingLabel="Saving...">
                Save policy
              </ActionSubmitButton>
            </div>
          </form>
          {isGlobalFreeMessageMode ? (
            <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-100">
              Per-model inputs are locked because a global allowance of{" "}
              {freeMessageSettings.globalLimit.toLocaleString()} messages per day is active.
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Languages</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Add new languages or toggle their availability. Default language must stay active.
          </p>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
            <form
              action={createLanguageAction}
              className="flex flex-col gap-4 rounded-lg border bg-background p-4"
            >
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="language-code">
                  Language code
                </label>
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  id="language-code"
                  name="code"
                  pattern="[a-z0-9-]{2,16}"
                  placeholder="fr"
                  required
                  title="Use 2-16 lowercase letters, numbers, or hyphens."
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="language-name">
                  Language name
                </label>
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  id="language-name"
                  name="name"
                  placeholder="French"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  className="h-4 w-4"
                  defaultChecked
                  name="isActive"
                  type="checkbox"
                />
                Active immediately
              </label>
              <ActionSubmitButton pendingLabel="Adding..." type="submit">
                Add language
              </ActionSubmitButton>
            </form>
            <div className="overflow-x-auto rounded-lg border bg-background">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead className="border-b bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Language</th>
                    <th className="px-4 py-3 text-left">Code</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {languages.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-muted-foreground text-sm" colSpan={4}>
                        No languages configured yet.
                      </td>
                    </tr>
                  ) : null}
                  {languages.map((language) => {
                    const statusBadge = language.isActive
                      ? "text-emerald-600 bg-emerald-500/10"
                      : "text-muted-foreground bg-muted/60";

                    return (
                      <tr key={language.id} className="align-middle">
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{language.name}</span>
                            {language.isDefault ? (
                              <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                                Default
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{language.code}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge}`}
                          >
                            {language.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {language.isDefault ? (
                            <span className="text-muted-foreground text-xs">
                              Default language
                            </span>
                          ) : (
                            <form
                              action={updateLanguageStatusAction}
                              className="inline-flex items-center justify-end"
                            >
                              <input name="languageId" type="hidden" value={language.id} />
                              <input
                                name="intent"
                                type="hidden"
                                value={language.isActive ? "deactivate" : "activate"}
                              />
                              <ActionSubmitButton
                                pendingLabel={language.isActive ? "Disabling..." : "Enabling..."}
                                size="sm"
                                variant="outline"
                              >
                                {language.isActive ? "Deactivate" : "Activate"}
                              </ActionSubmitButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Suggested prompts</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Customize the quick-start prompts that appear on the home screen. Enter one prompt per line for each language. If a language has no custom prompts, the default language prompts are used.
          </p>
          {languagePromptConfigs.length === 0 ? (
            <div className="mt-6 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-sm text-muted-foreground">
              No active languages are configured. Add a language before managing prompts.
            </div>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {languagePromptConfigs.map(({ language, prompts }) => (
                <LanguagePromptsForm
                  key={language.id}
                  initialPrompts={prompts}
                  language={language}
                  onSubmit={updateSuggestedPromptsAction}
                />
              ))}
            </div>
          )}
        </section>
        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Public page content</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Update the copy shown on the public About, Privacy Policy, and Terms of Service pages.
            Basic Markdown (## headings and bullet lists) is supported.
          </p>
          {activeLanguagesList.length === 0 ? (
            <div className="mt-6 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-sm text-muted-foreground">
              No active languages are configured. Add a language before managing public page content.
            </div>
          ) : (
            <div className="mt-6 space-y-10">
              <div className="space-y-4">
                <h3 className="text-base font-semibold">About page content</h3>
                <div className="grid gap-6 lg:grid-cols-2">
                  {languageAboutConfigs.map(({ language, content }) => (
                <LanguageContentForm
                  key={language.id}
                  contentLabel="about content"
                  helperText={{
                    default:
                      "Shown on the about page when no localized version is available.",
                    localized: `Displayed when ${language.name} is selected. Falls back to the default language if left blank.`,
                  }}
                  initialContent={content}
                  language={language}
                  onSubmit={updateAboutContentAction}
                  placeholders={{
                        default: "Enter about content",
                        localized: "Provide localized about content",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold">Privacy policy content</h3>
                  <p className="text-muted-foreground text-xs">
                    Appears at <code className="rounded bg-muted px-1 py-0.5 text-xs">/privacy-policy</code>.
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  {languagePrivacyConfigs.map(({ language, content }) => (
                    <LanguageContentForm
                      key={language.id}
                      contentLabel="privacy policy"
                      helperText={{
                        default:
                          "Shown on the privacy policy page when no localized version is available.",
                        localized: `Displayed when ${language.name} is selected. Falls back to the default language if left blank.`,
                      }}
                      initialContent={content}
                      language={language}
                      onSubmit={updatePrivacyPolicyByLanguageAction}
                      placeholders={{
                        default: "Enter privacy policy content",
                        localized: "Provide localized privacy policy content",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold">Terms of service content</h3>
                  <p className="text-muted-foreground text-xs">
                    Appears at <code className="rounded bg-muted px-1 py-0.5 text-xs">/terms-of-service</code>.
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  {languageTermsConfigs.map(({ language, content }) => (
                    <LanguageContentForm
                      key={language.id}
                      contentLabel="terms of service"
                      helperText={{
                        default:
                          "Shown on the terms of service page when no localized version is available.",
                        localized: `Displayed when ${language.name} is selected. Falls back to the default language if left blank.`,
                      }}
                      initialContent={content}
                      language={language}
                      onSubmit={updateTermsOfServiceByLanguageAction}
                      placeholders={{
                        default: "Enter terms of service content",
                        localized: "Provide localized terms of service content",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Pricing plans</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Define recharge tiers that control how many tokens and credits users receive.
            Plans become available immediately.
          </p>
          <div className="mt-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-1">
            <div>Current recommended plan: {recommendedPlanName ?? "None selected"}</div>
            {recommendedPlanSetting && !recommendedPlanId ? (
              <div className="text-amber-600">
                The previously selected plan is no longer active. Choose a new recommended plan below.
              </div>
            ) : null}
          </div>

          <form action={createPricingPlanAction} className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="plan-name">
                Plan name
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="plan-name"
                name="name"
                placeholder="Starter"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="plan-price">
                Price (INR)
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="plan-price"
                min="0"
                name="priceInRupees"
                placeholder="299"
                required
                step="0.01"
                type="number"
              />
            </div>
            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="plan-description">
                Description
              </label>
              <textarea
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="plan-description"
                name="description"
                placeholder="Great for individual builders."
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="plan-tokens">
                Token allowance
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="plan-tokens"
                min={0}
                name="tokenAllowance"
                placeholder="100000"
                required
                type="number"
              />
              <p className="text-muted-foreground text-xs">
                Display credits are calculated automatically ({TOKENS_PER_CREDIT} tokens per credit).
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="plan-duration">
                Billing cycle (days)
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="plan-duration"
                min={0}
                name="billingCycleDays"
                placeholder="90"
                required
                type="number"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                className="h-4 w-4"
                defaultChecked
                id="plan-active"
                name="isActive"
                type="checkbox"
              />
              <label className="text-sm font-medium" htmlFor="plan-active">
                Plan is active
              </label>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <ActionSubmitButton pendingLabel="Creating...">
                Create plan
              </ActionSubmitButton>
            </div>
          </form>

          <div className="mt-8 space-y-4">
            {activePlans.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No plans created yet.
              </p>
            ) : (
              activePlans.map((plan) => {
                const priceInRupees = plan.priceInPaise / 100;
                const credits = Math.floor(plan.tokenAllowance / TOKENS_PER_CREDIT);
                const isRecommendedPlan = recommendedPlanId === plan.id;
                const nonDefaultLanguages = activeLanguagesList.filter(
                  (language) => !language.isDefault,
                );

                return (
                  <details
                    key={plan.id}
                    className="overflow-hidden rounded-lg border bg-background"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-4 bg-muted/50 px-4 py-3 text-sm font-medium">
                      <span className="flex items-center gap-2">
                        <span>{plan.name}</span>
                        {isRecommendedPlan ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Recommended
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {plan.isActive ? "Active" : "Inactive"}
                      </span>
                    </summary>
                    <div className="grid gap-6 border-t p-4 md:grid-cols-[3fr,2fr]">
                      <div className="space-y-6">
                        <form action={updatePricingPlanAction} className="flex flex-col gap-4">
                        <input name="id" type="hidden" value={plan.id} />
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium" htmlFor={`plan-update-name-${plan.id}`}>
                            Plan name (English)
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={plan.name}
                            id={`plan-update-name-${plan.id}`}
                            name="name"
                            required
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium" htmlFor={`plan-update-description-${plan.id}`}>
                            Description (English)
                          </label>
                          <textarea
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={plan.description ?? ""}
                            id={`plan-update-description-${plan.id}`}
                            name="description"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium">
                            Price (INR)
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={priceInRupees}
                            min="0"
                            name="priceInRupees"
                            step="0.01"
                            type="number"
                          />
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                          <div className="flex flex-col gap-2 sm:flex-1">
                            <label className="text-sm font-medium">
                              Token allowance
                            </label>
                            <input
                              className="rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={plan.tokenAllowance}
                              min={0}
                              name="tokenAllowance"
                              type="number"
                            />
                          </div>
                          <div className="flex flex-col gap-2 sm:w-48">
                            <label className="text-sm font-medium">
                              Cycle (days)
                            </label>
                            <input
                              className="rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={plan.billingCycleDays}
                              min={0}
                              name="billingCycleDays"
                              type="number"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            className="h-4 w-4"
                            defaultChecked={plan.isActive}
                            id={`plan-active-${plan.id}`}
                            name="isActive"
                            type="checkbox"
                          />
                          <label
                            className="text-sm font-medium"
                            htmlFor={`plan-active-${plan.id}`}
                          >
                            Plan is active
                          </label>
                        </div>
                        <div className="flex justify-end gap-2">
                          <ActionSubmitButton pendingLabel="Saving...">
                            Save changes
                          </ActionSubmitButton>
                        </div>
                      </form>

                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-muted-foreground">
                          Localized content
                        </h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          {nonDefaultLanguages.length === 0 ? (
                            <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
                              Add another language to provide localized plan details.
                            </div>
                          ) : (
                            nonDefaultLanguages.map((language) => {
                              const translation =
                                planTranslationsByLanguage[language.code]?.[plan.id] ?? {
                                  name: "",
                                  description: "",
                                };
                              const formId = `plan-translation-${plan.id}-${language.code}`;

                              return (
                                <form
                                  action={updatePlanTranslationAction}
                                  className="flex flex-col gap-3 rounded-lg border bg-background p-3"
                                  key={formId}
                                >
                                  <input name="planId" type="hidden" value={plan.id} />
                                  <input name="languageCode" type="hidden" value={language.code} />
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium">{language.name}</span>
                                    <span className="text-muted-foreground text-xs">
                                      {language.code.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    <label className="text-xs font-medium" htmlFor={`${formId}-name`}>
                                      Plan name
                                    </label>
                                    <input
                                      className="rounded-md border bg-background px-3 py-2 text-sm"
                                      defaultValue={translation.name}
                                      id={`${formId}-name`}
                                      name="name"
                                      placeholder="Enter localized name"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    <label className="text-xs font-medium" htmlFor={`${formId}-description`}>
                                      Description
                                    </label>
                                    <textarea
                                      className="rounded-md border bg-background px-3 py-2 text-sm"
                                      defaultValue={translation.description}
                                      id={`${formId}-description`}
                                      name="description"
                                      placeholder="Enter localized description"
                                    />
                                    <p className="text-muted-foreground text-[11px]">
                                      Leave blank to fall back to English.
                                    </p>
                                  </div>
                                  <div className="flex justify-end">
                                    <ActionSubmitButton
                                      pendingLabel="Saving..."
                                      size="sm"
                                      variant="outline"
                                    >
                                      {`Save ${language.name}`}
                                    </ActionSubmitButton>
                                  </div>
                                </form>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                      <div className="flex flex-col justify-between gap-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              {isRecommendedPlan ? "Recommended plan" : "Not recommended"}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {isRecommendedPlan ? (
                                <form action={setRecommendedPricingPlanAction}>
                                  <input name="planId" type="hidden" value="" />
                                  <ActionSubmitButton pendingLabel="Updating..." variant="outline">
                                    Remove recommendation
                                  </ActionSubmitButton>
                                </form>
                              ) : (
                                <form action={setRecommendedPricingPlanAction}>
                                  <input name="planId" type="hidden" value={plan.id} />
                                  <ActionSubmitButton pendingLabel="Updating..." disabled={!plan.isActive}>
                                    Set as recommended
                                  </ActionSubmitButton>
                                </form>
                              )}
                            </div>
                          </div>
                          {!plan.isActive && !isRecommendedPlan ? (
                            <p className="text-xs text-muted-foreground">
                              Activate this plan before setting it as recommended.
                            </p>
                          ) : null}
                        </div>
                        <dl className="grid gap-2 text-sm">
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">
                              Credits provided
                            </dt>
                            <dd className="font-medium">
                              {credits.toLocaleString()}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">
                              Tokens provided
                            </dt>
                            <dd className="font-medium">
                              {plan.tokenAllowance.toLocaleString()}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">
                              Billing cycle
                            </dt>
                            <dd className="font-medium">
                              {plan.billingCycleDays} day
                              {plan.billingCycleDays === 1 ? "" : "s"}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">
                              Price (INR)
                            </dt>
                            <dd className="font-medium">
                              {priceInRupees.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </dd>
                          </div>
                        </dl>
                        <div className="flex flex-wrap gap-2">
                          <form action={deletePricingPlanAction}>
                            <input name="id" type="hidden" value={plan.id} />
                            <ActionSubmitButton
                              className="border border-destructive text-destructive hover:bg-destructive/10"
                              pendingLabel="Soft deleting..."
                              variant="outline"
                            >
                              Soft delete
                            </ActionSubmitButton>
                          </form>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })
            )}
          </div>

          {deletedPlans.length > 0 && (
            <div className="mt-8 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Deleted plans
              </h3>
              <div className="grid gap-2">
                {deletedPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3 text-sm shadow-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{plan.name}</span>
                      <span className="text-muted-foreground text-xs">
                        Deleted{" "}
                        {plan.deletedAt
                          ? formatDistanceToNow(new Date(plan.deletedAt), {
                              addSuffix: true,
                            })
                          : "recently"}
                      </span>
                    </div>
                    <form action={hardDeletePricingPlanAction}>
                      <input name="id" type="hidden" value={plan.id} />
                      <ActionSubmitButton
                        pendingLabel="Hard deleting..."
                        size="sm"
                        variant="destructive"
                      >
                        Hard delete
                      </ActionSubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Active subscriptions</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Recent users with active plans and their remaining balances.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="py-2 text-left">User</th>
                  <th className="py-2 text-left">Plan</th>
                  <th className="py-2 text-right">Tokens left</th>
                  <th className="py-2 text-right">Expires</th>
                </tr>
              </thead>
              <tbody>
                {activeSubscriptions.length === 0 ? (
                  <tr>
                    <td className="py-4 text-muted-foreground" colSpan={4}>
                      No active subscriptions yet.
                    </td>
                  </tr>
                ) : (
                  activeSubscriptions.map((subscription) => (
                    <tr key={subscription.subscriptionId} className="border-t">
                      <td className="py-2 font-mono text-xs">
                        {subscription.userEmail}
                      </td>
                      <td className="py-2">
                        {subscription.planName ?? "Plan removed"}
                      </td>
                      <td className="py-2 text-right">
                        {subscription.tokenBalance.toLocaleString()} /{" "}
                        {subscription.tokenAllowance.toLocaleString()}
                      </td>
                      <td className="py-2 text-right">
                        {new Date(subscription.expiresAt).toLocaleDateString(
                          "en-IN",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Add new model</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Configure additional providers. Ensure the relevant API key is available in the environment.
          </p>

          <form action={createModelConfigAction} className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="key">
                Model key
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="key"
                name="key"
                placeholder="openai-gpt-4o-mini"
                required
              />
              <p className="text-muted-foreground text-xs">
                Internal identifier that must be unique.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="provider">
                Provider
              </label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue="openai"
                id="provider"
                name="provider"
                required
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="providerModelId">
                Provider model ID
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="providerModelId"
                name="providerModelId"
                placeholder="gpt-4o-mini"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="displayName">
                Display name
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="displayName"
                name="displayName"
                placeholder="GPT-4o mini"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="inputCostPerMillion">
                Input cost (USD / 1M tokens)
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={0}
                id="inputCostPerMillion"
                min={0}
                name="inputCostPerMillion"
                step="0.000001"
                type="number"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="outputCostPerMillion">
                Output cost (USD / 1M tokens)
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={0}
                id="outputCostPerMillion"
                min={0}
                name="outputCostPerMillion"
                step="0.000001"
                type="number"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="inputProviderCostPerMillion">
                Provider input cost (USD / 1M tokens)
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={0}
                id="inputProviderCostPerMillion"
                min={0}
                name="inputProviderCostPerMillion"
                step="0.000001"
                type="number"
              />
              <p className="text-muted-foreground text-xs">
                Private reference so you can compare user pricing versus your provider costs.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="outputProviderCostPerMillion">
                Provider output cost (USD / 1M tokens)
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={0}
                id="outputProviderCostPerMillion"
                min={0}
                name="outputProviderCostPerMillion"
                step="0.000001"
                type="number"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="freeMessagesPerDay">
                Daily free messages
              </label>
              <input
                aria-disabled={isGlobalFreeMessageMode || undefined}
                className={perModelInputClassName}
                defaultValue={DEFAULT_FREE_MESSAGES_PER_DAY}
                id="freeMessagesPerDay"
                min={0}
                name="freeMessagesPerDay"
                readOnly={isGlobalFreeMessageMode}
                step={1}
                type="number"
              />
              <p className="text-muted-foreground text-xs">{perModelFieldDescription}</p>
            </div>

            <div className="md:col-span-2 flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="description">
                Description
              </label>
              <textarea
                className="min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm"
                id="description"
                name="description"
                placeholder="Explain what this model is best suited for."
              />
            </div>

            <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="systemPrompt">
                  System prompt (optional)
                </label>
                <textarea
                  className="min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
                  id="systemPrompt"
                  name="systemPrompt"
                  placeholder="Custom system instructions"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="codeTemplate">
                  Provider code snippet (optional)
                </label>
                <textarea
                  className="min-h-[100px] rounded-md border bg-background px-3 py-2 font-mono text-xs"
                  id="codeTemplate"
                  name="codeTemplate"
                  placeholder='Store reference code for this model (not executed).'
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="reasoningTag">
                Reasoning tag
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="reasoningTag"
                name="reasoningTag"
                placeholder="think"
              />
              <p className="text-muted-foreground text-xs">
                Required when enabling reasoning output to wrap &lt;tag&gt; sequences.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="configJson">
                Provider config (JSON, optional)
              </label>
              <textarea
                className="min-h-[100px] rounded-md border bg-background px-3 py-2 font-mono text-xs"
                id="configJson"
                name="configJson"
                placeholder='{"baseURL":"https://..."}'
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                className="h-4 w-4"
                defaultChecked
                id="isEnabled"
                name="isEnabled"
                type="checkbox"
              />
              <label className="text-sm font-medium" htmlFor="isEnabled">
                Enable immediately
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                className="h-4 w-4"
                id="supportsReasoning"
                name="supportsReasoning"
                type="checkbox"
              />
              <label className="text-sm font-medium" htmlFor="supportsReasoning">
                Supports reasoning traces
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                className="h-4 w-4"
                id="isDefault"
                name="isDefault"
                type="checkbox"
              />
              <label className="text-sm font-medium" htmlFor="isDefault">
                Set as default model
              </label>
            </div>

            <div className="md:col-span-2 flex justify-end">
              <ActionSubmitButton pendingLabel="Creating...">
                Create model
              </ActionSubmitButton>
            </div>
          </form>
        </section>

        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Configured models</h2>
          <div className="mt-4 space-y-6">
            {activeModels.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No models configured yet.
              </p>
            ) : (
              activeModels.map((model) => {
                const chargeInputRate = Number(model.inputCostPerMillion ?? 0);
                const chargeOutputRate = Number(model.outputCostPerMillion ?? 0);
                const providerInputRate = Number(
                  model.inputProviderCostPerMillion ?? 0
                );
                const providerOutputRate = Number(
                  model.outputProviderCostPerMillion ?? 0
                );
                const totalChargeRate = chargeInputRate + chargeOutputRate;
                const totalProviderRate =
                  providerInputRate + providerOutputRate;
                const marginPerMillion = totalChargeRate - totalProviderRate;
                const marginPerCredit =
                  (marginPerMillion / 1_000_000) * TOKENS_PER_CREDIT;
                const marginPercentage =
                  totalChargeRate > 0
                    ? (marginPerMillion / totalChargeRate) * 100
                    : 0;
                const formatUsd = (value: number) =>
                  value.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: value >= 1 ? 2 : 4,
                    maximumFractionDigits: 6,
                  });

                return (
                  <details key={model.id} className="rounded-md border bg-background p-4">
                  <summary className="flex flex-col gap-1 cursor-pointer">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{model.displayName}</span>
                      <ProviderBadge value={model.provider} />
                      <EnabledBadge enabled={model.isEnabled} />
                      {model.isDefault && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Default
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground text-xs font-mono">
                      {model.providerModelId}
                    </span>
                  </summary>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <form action={updateModelConfigAction} className="md:col-span-2 grid gap-4 md:grid-cols-2">
                      <input name="id" type="hidden" value={model.id} />

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">
                          Display name
                        </label>
                        <input
                          className="rounded-md border bg-background px-3 py-2 text-sm"
                          defaultValue={model.displayName}
                          name="displayName"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Provider</label>
                        <select
                          className="rounded-md border bg-background px-3 py-2 text-sm"
                          defaultValue={model.provider}
                          name="provider"
                        >
                          {PROVIDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">
                          Provider model ID
                        </label>
                        <input
                          className="rounded-md border bg-background px-3 py-2 text-sm"
                          defaultValue={model.providerModelId}
                          name="providerModelId"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">
                          Input cost (USD / 1M tokens)
                        </label>
                        <input
                          className="rounded-md border bg-background px-3 py-2 text-sm"
                          defaultValue={model.inputCostPerMillion ?? 0}
                          min={0}
                          name="inputCostPerMillion"
                          step="0.000001"
                          type="number"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">
                          Output cost (USD / 1M tokens)
                        </label>
                        <input
                          className="rounded-md border bg-background px-3 py-2 text-sm"
                          defaultValue={model.outputCostPerMillion ?? 0}
                          min={0}
                          name="outputCostPerMillion"
                          step="0.000001"
                          type="number"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">
                          Provider input cost (USD / 1M tokens)
                        </label>
                        <input
                          className="rounded-md border bg-background px-3 py-2 text-sm"
                          defaultValue={model.inputProviderCostPerMillion ?? 0}
                          min={0}
                          name="inputProviderCostPerMillion"
                          step="0.000001"
                          type="number"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">
                          Provider output cost (USD / 1M tokens)
                        </label>
                        <input
                          className="rounded-md border bg-background px-3 py-2 text-sm"
                          defaultValue={model.outputProviderCostPerMillion ?? 0}
                          min={0}
                          name="outputProviderCostPerMillion"
                          step="0.000001"
                          type="number"
                        />
                        <p className="text-muted-foreground text-xs">
                          Only visible here — use it to track your real spend versus credits charged.
                        </p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">
                          Daily free messages
                        </label>
                        <input
                          aria-disabled={isGlobalFreeMessageMode || undefined}
                          className={perModelInputClassName}
                          defaultValue={model.freeMessagesPerDay ?? DEFAULT_FREE_MESSAGES_PER_DAY}
                          min={0}
                          name="freeMessagesPerDay"
                          readOnly={isGlobalFreeMessageMode}
                          step={1}
                          type="number"
                        />
                        <p className="text-muted-foreground text-xs">
                          {perModelFieldDescription}
                        </p>
                      </div>

                      <div className="md:col-span-2 rounded-lg border border-dashed bg-muted/30 p-4 text-xs sm:text-sm">
                        <h4 className="text-sm font-semibold text-foreground">
                          Margin snapshot (per {TOKENS_PER_CREDIT.toLocaleString()} tokens)
                        </h4>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs uppercase tracking-wide">
                              User pricing (1M tokens)
                            </p>
                            <p>
                              Input: {formatUsd(chargeInputRate)}
                            </p>
                            <p>
                              Output: {formatUsd(chargeOutputRate)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs uppercase tracking-wide">
                              Provider cost (1M tokens)
                            </p>
                            <p>
                              Input: {formatUsd(providerInputRate)}
                            </p>
                            <p>
                              Output: {formatUsd(providerOutputRate)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs uppercase tracking-wide">
                              Gross margin / 1M tokens
                            </p>
                            <p className={marginPerMillion < 0 ? "text-destructive" : undefined}>
                              {formatUsd(marginPerMillion)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs uppercase tracking-wide">
                              Gross margin / credit
                            </p>
                            <p className={marginPerCredit < 0 ? "text-destructive" : undefined}>
                              {formatUsd(marginPerCredit)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs uppercase tracking-wide">
                              Margin percentage
                            </p>
                            <p className={marginPercentage < 0 ? "text-destructive" : undefined}>
                              {Number.isFinite(marginPercentage)
                                ? `${marginPercentage.toFixed(2)}%`
                                : "—"}
                            </p>
                          </div>
                        </div>
                        <p className="text-muted-foreground mt-3 text-xs">
                          These values update when you save changes. They help estimate how much each credit earns after provider costs.
                        </p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">
                          Reasoning tag
                        </label>
                        <input
                          className="rounded-md border bg-background px-3 py-2 text-sm"
                          defaultValue={model.reasoningTag ?? ""}
                          name="reasoningTag"
                        />
                      </div>

                      <div className="md:col-span-2 flex flex-col gap-2">
                        <label className="text-sm font-medium">
                          Description
                        </label>
                        <textarea
                          className="min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm"
                          defaultValue={model.description}
                          name="description"
                        />
                      </div>

                      <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium">
                            System prompt
                          </label>
                          <textarea
                            className="min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={model.systemPrompt ?? ""}
                            name="systemPrompt"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium">
                            Provider code snippet
                          </label>
                          <textarea
                            className="min-h-[100px] rounded-md border bg-background px-3 py-2 font-mono text-xs"
                            defaultValue={model.codeTemplate ?? ""}
                            name="codeTemplate"
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2 flex flex-col gap-2">
                        <label className="text-sm font-medium">
                          Provider config (JSON)
                        </label>
                        <textarea
                          className="min-h-[100px] rounded-md border bg-background px-3 py-2 font-mono text-xs"
                          defaultValue={
                            model.config ? JSON.stringify(model.config, null, 2) : ""
                          }
                          name="configJson"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          className="h-4 w-4"
                          defaultChecked={model.supportsReasoning}
                          id={`supportsReasoning-${model.id}`}
                          name="supportsReasoning"
                          type="checkbox"
                        />
                        <label
                          className="text-sm font-medium"
                          htmlFor={`supportsReasoning-${model.id}`}
                        >
                          Supports reasoning traces
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          className="h-4 w-4"
                          defaultChecked={model.isEnabled}
                          id={`isEnabled-${model.id}`}
                          name="isEnabled"
                          type="checkbox"
                        />
                        <label
                          className="text-sm font-medium"
                          htmlFor={`isEnabled-${model.id}`}
                        >
                          Enabled
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          className="h-4 w-4"
                          defaultChecked={model.isDefault}
                          id={`isDefault-${model.id}`}
                          name="isDefault"
                          type="checkbox"
                        />
                        <label
                          className="text-sm font-medium"
                          htmlFor={`isDefault-${model.id}`}
                        >
                          Default model
                        </label>
                      </div>

                      <div className="md:col-span-2 flex justify-end">
                        <ActionSubmitButton pendingLabel="Saving...">
                          Save changes
                        </ActionSubmitButton>
                      </div>
                    </form>

                    <div className="md:col-span-2 flex flex-wrap gap-3">
                      {!model.isDefault && (
                        <form action={setDefaultModelConfigAction}>
                          <input name="id" type="hidden" value={model.id} />
                          <ActionSubmitButton
                            pendingLabel="Updating..."
                            size="sm"
                            variant="outline"
                          >
                            Set as default
                          </ActionSubmitButton>
                        </form>
                      )}

                      <form action={deleteModelConfigAction}>
                        <input name="id" type="hidden" value={model.id} />
                        <ActionSubmitButton
                          className="border border-destructive text-destructive hover:bg-destructive/10"
                          pendingLabel="Soft deleting..."
                          size="sm"
                          variant="outline"
                        >
                          Soft delete
                        </ActionSubmitButton>
                      </form>
                    </div>
                  </div>
                </details>
              );
            })
            )}
          </div>

          {deletedModels.length > 0 && (
            <div className="mt-8 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Deleted models
              </h3>
              <div className="grid gap-2">
                {deletedModels.map((model) => (
                  <div
                    key={model.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3 text-sm shadow-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{model.displayName}</span>
                      <span className="text-muted-foreground text-xs">
                        Deleted{" "}
                        {model.deletedAt
                          ? formatDistanceToNow(new Date(model.deletedAt), {
                              addSuffix: true,
                            })
                          : "recently"}
                      </span>
                    </div>
                    <form action={hardDeleteModelConfigAction}>
                      <input name="id" type="hidden" value={model.id} />
                      <ActionSubmitButton
                        pendingLabel="Hard deleting..."
                        size="sm"
                        variant="destructive"
                      >
                        Hard delete
                      </ActionSubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}





