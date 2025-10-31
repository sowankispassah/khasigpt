import {
  getAppSetting,
  listActiveSubscriptionSummaries,
  listModelConfigs,
  listPricingPlans,
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
  updatePrivacyPolicyAction,
  updateTermsOfServiceAction,
  updateAboutContentAction,
  updateSuggestedPromptsAction,
} from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminSettingsNotice } from "./notice";
import {
  DEFAULT_SUGGESTED_PROMPTS,
  DEFAULT_PRIVACY_POLICY,
  DEFAULT_TERMS_OF_SERVICE,
  DEFAULT_ABOUT_US,
  TOKENS_PER_CREDIT,
  RECOMMENDED_PRICING_PLAN_SETTING_KEY,
} from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

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
    suggestedPromptsSetting,
    recommendedPlanSetting,
  ] = await Promise.all([
    listModelConfigs({ includeDisabled: true, includeDeleted: true, limit: 200 }),
    listPricingPlans({ includeInactive: true, includeDeleted: true }),
    listActiveSubscriptionSummaries({ limit: 10 }),
    getAppSetting<string>("privacyPolicy"),
    getAppSetting<string>("termsOfService"),
    getAppSetting<string>("aboutUsContent"),
    getAppSetting<string[]>("suggestedPrompts"),
    getAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY),
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
  const suggestedPromptsList = Array.isArray(suggestedPromptsSetting)
    ? suggestedPromptsSetting.filter(
        (item) => typeof item === "string" && item.trim().length > 0
      )
    : [];
  const suggestedPrompts =
    suggestedPromptsList.length > 0
      ? suggestedPromptsList
      : DEFAULT_SUGGESTED_PROMPTS;

  return (
    <>
      <AdminSettingsNotice notice={notice} />

      <div className="flex flex-col gap-10">
        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Suggested prompts</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Customize the quick-start prompts that appear on the home screen. Enter one prompt per line.
          </p>
          <form action={updateSuggestedPromptsAction} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="suggested-prompts">
                Home screen presets
              </label>
              <textarea
                className="min-h-[12rem] rounded-md border bg-background px-3 py-2 text-sm leading-6"
                defaultValue={suggestedPrompts.join("\n")}
                id="suggested-prompts"
                name="prompts"
                required
              />
              <p className="text-muted-foreground text-xs">
                Separate prompts with new lines. The first four prompts are shown by default.
              </p>
            </div>
            <div className="flex justify-end">
              <ActionSubmitButton pendingLabel="Saving...">
                Save suggested prompts
              </ActionSubmitButton>
            </div>
          </form>
        </section>
        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Public page content</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Update the copy shown on the public About, Privacy Policy, and Terms of Service pages.
            Basic Markdown (## headings and bullet lists) is supported.
          </p>
          <form action={updateAboutContentAction} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="about-content">
                About page content
              </label>
              <textarea
                className="min-h-[16rem] rounded-md border bg-background px-3 py-2 text-sm leading-6"
                defaultValue={aboutContent}
                id="about-content"
                name="content"
              />
              <p className="text-muted-foreground text-xs">
                This text appears at <code className="rounded bg-muted px-1 py-0.5 text-xs">/about</code>. If left empty, a default message is shown.
              </p>
            </div>
            <div className="flex justify-end">
              <ActionSubmitButton pendingLabel="Saving...">
                Save about page
              </ActionSubmitButton>
            </div>
          </form>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <form action={updatePrivacyPolicyAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="privacy-policy-content">
                  Privacy policy content
                </label>
                <textarea
                  className="min-h-[16rem] rounded-md border bg-background px-3 py-2 text-sm leading-6"
                  defaultValue={privacyPolicyContent}
                  id="privacy-policy-content"
                  name="content"
                  required
                />
                <p className="text-muted-foreground text-xs">
                  This text appears at <code className="rounded bg-muted px-1 py-0.5 text-xs">/privacy-policy</code>.
                </p>
              </div>
              <div className="flex justify-end">
                <ActionSubmitButton pendingLabel="Saving...">
                  Save privacy policy
                </ActionSubmitButton>
              </div>
            </form>

            <form action={updateTermsOfServiceAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="terms-of-service-content">
                  Terms of service content
                </label>
                <textarea
                  className="min-h-[16rem] rounded-md border bg-background px-3 py-2 text-sm leading-6"
                  defaultValue={termsOfServiceContent}
                  id="terms-of-service-content"
                  name="content"
                  required
                />
                <p className="text-muted-foreground text-xs">
                  This text appears at <code className="rounded bg-muted px-1 py-0.5 text-xs">/terms-of-service</code>.
                </p>
              </div>
              <div className="flex justify-end">
                <ActionSubmitButton pendingLabel="Saving...">
                  Save terms of service
                </ActionSubmitButton>
              </div>
            </form>
          </div>
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
                      <form action={updatePricingPlanAction} className="flex flex-col gap-4">
                        <input name="id" type="hidden" value={plan.id} />
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium" htmlFor="plan-update-name">
                            Plan name
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={plan.name}
                            name="name"
                            required
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium" htmlFor="plan-update-description">
                            Description
                          </label>
                          <textarea
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={plan.description ?? ""}
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
              activeModels.map((model) => (
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
              ))
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





