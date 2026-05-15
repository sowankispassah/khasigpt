import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthLookupUnavailableError } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import {
  loadBillingReadModel,
  loadFeatureAccessReadModel,
  loadLanguageReadModel,
  loadModelConfigReadModel,
  loadPricingReadModel,
  loadPromptReadModel,
  loadTranslateReadModel,
} from "@/lib/api/read-models";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STARTUP_SECTION_TIMEOUT_MS = 2500;
const FULL_SECTION_TIMEOUT_MS = 8000;

type LanguageSnapshot = Awaited<ReturnType<typeof loadLanguageReadModel>>;
type FeatureSnapshot = Awaited<ReturnType<typeof loadFeatureAccessReadModel>>;
type ModelConfigSnapshot = Awaited<ReturnType<typeof loadModelConfigReadModel>>;
type PromptSnapshot = Awaited<ReturnType<typeof loadPromptReadModel>>;
type TranslateSnapshot = Awaited<ReturnType<typeof loadTranslateReadModel>>;
type PricingSnapshot = Awaited<ReturnType<typeof loadPricingReadModel>>;
type BootstrapSection =
  | "billing"
  | "features"
  | "i18n"
  | "modelConfig"
  | "pricing"
  | "prompts"
  | "translate";
type BootstrapSectionResult<T> = {
  data: T;
  degraded: boolean;
};

const FALLBACK_LANGUAGE = {
  id: "fallback-en",
  code: "en",
  name: "English",
  displayName: "English",
  nativeName: "English",
  isDefault: true,
  isActive: true,
  syncUiLanguage: true,
};

const STARTUP_LANGUAGE_NAMES: Record<
  string,
  { displayName: string; nativeName?: string }
> = {
  en: { displayName: "English", nativeName: "English" },
  kha: { displayName: "Khasi", nativeName: "Khasi" },
};

function resolveStartupLanguageName(code: string) {
  return STARTUP_LANGUAGE_NAMES[code]?.displayName ?? code;
}

function buildStartupLanguageOption(
  code: string,
  options: {
    isDefault?: boolean;
    syncUiLanguage?: boolean;
  } = {}
) {
  const name = resolveStartupLanguageName(code);

  return {
    id: `startup-${code}`,
    code,
    name,
    displayName: name,
    nativeName: STARTUP_LANGUAGE_NAMES[code]?.nativeName ?? name,
    isDefault: options.isDefault ?? code === FALLBACK_LANGUAGE.code,
    isActive: true,
    syncUiLanguage: options.syncUiLanguage ?? code === FALLBACK_LANGUAGE.code,
  };
}

const STARTUP_LANGUAGES = [
  buildStartupLanguageOption("en", {
    isDefault: true,
    syncUiLanguage: true,
  }),
  buildStartupLanguageOption("kha", {
    isDefault: false,
    syncUiLanguage: false,
  }),
];

function buildStartupLanguageSnapshot(
  preferredLanguage: string | null
): LanguageSnapshot {
  const code = preferredLanguage?.trim().toLowerCase();
  const activeLanguage =
    STARTUP_LANGUAGES.find((language) => language.code === code) ??
    STARTUP_LANGUAGES.find((language) => language.isDefault) ??
    FALLBACK_LANGUAGE;

  return {
    i18n: {
      activeLanguage,
      languages: STARTUP_LANGUAGES,
      dictionary: {},
      dictionaryLanguageCode: "",
    },
    chatLanguages: STARTUP_LANGUAGES,
  };
}

const FALLBACK_FEATURE_SNAPSHOT: FeatureSnapshot = {
  calculator: false,
  customKnowledge: false,
  documentUploads: false,
  forum: true,
  jobs: false,
  study: false,
  translate: false,
  imageGeneration: {
    enabled: false,
    canGenerate: false,
    requiresPaidCredits: false,
  },
};

const FALLBACK_MODEL_CONFIG: ModelConfigSnapshot = {
  defaultModelId: null,
  models: [],
};

const FALLBACK_PROMPT_SNAPSHOT: PromptSnapshot = {
  iconPromptActions: [],
  suggestedPrompts: [],
};

const FALLBACK_TRANSLATE_SNAPSHOT: TranslateSnapshot = {
  providerMode: "ai",
  languages: [],
};

const FALLBACK_PRICING_SNAPSHOT: PricingSnapshot = {
  imageGenerationEnabledForAll: false,
  recommendedPlanId: null,
  plans: [],
};

async function safeBootstrapSection<T>({
  fallback,
  label,
  loader,
  phase,
}: {
  fallback: T;
  label: string;
  loader: () => Promise<T>;
  phase: "startup" | "full";
}): Promise<BootstrapSectionResult<T>> {
  const timeoutMs =
    phase === "startup" ? STARTUP_SECTION_TIMEOUT_MS : FULL_SECTION_TIMEOUT_MS;

  try {
    const data = await withApiTiming(
      label,
      () =>
        withTimeout(loader(), timeoutMs, () => {
          console.warn(
            `[api/mobile/bootstrap] ${label} timed out during ${phase}; using fallback.`
          );
        }),
      { slowMs: phase === "startup" ? 500 : 1500 }
    );
    return { data, degraded: false };
  } catch (error) {
    console.error(
      `[api/mobile/bootstrap] ${label} failed during ${phase}; using fallback.`,
      error
    );
    return { data: fallback, degraded: true };
  }
}

export async function GET(request: Request) {
  let session: Awaited<ReturnType<typeof getMobileSession>>;
  try {
    session = await withApiTiming(
      "mobile.bootstrap.auth",
      () =>
        getMobileSession(request, {
          allowCookie: false,
          bearerTimeoutMs: 2500,
        }),
      { slowMs: 750 }
    );
  } catch (error) {
    if (error instanceof AuthLookupUnavailableError) {
      return NextResponse.json(
        {
          code: error.code,
          message: "Startup account data is temporarily unavailable.",
        },
        {
          headers: noStoreHeaders(),
          status: error.status,
        }
      );
    }
    throw error;
  }

  const cookieStore = await cookies();
  const { searchParams } = new URL(request.url);
  const requestedLanguage = searchParams.get("lang")?.trim().toLowerCase() ?? null;
  const phase =
    searchParams.get("phase")?.trim().toLowerCase() === "startup"
      ? "startup"
      : "full";
  const isStartupPhase = phase === "startup";
  const preferredLanguage = requestedLanguage || cookieStore.get("lang")?.value || null;
  const role = session?.user?.role ?? null;
  const userId = session?.user?.id ?? null;

  const [
    languageSnapshotResult,
    featureSnapshotResult,
    modelConfigResult,
    promptSnapshotResult,
    translateResult,
    pricingResult,
    balanceResult,
  ] = await Promise.all([
    safeBootstrapSection({
      fallback: buildStartupLanguageSnapshot(preferredLanguage),
      label: "mobile.bootstrap.languages",
      loader: () => loadLanguageReadModel(preferredLanguage),
      phase,
    }),
    safeBootstrapSection({
      fallback: FALLBACK_FEATURE_SNAPSHOT,
      label: "mobile.bootstrap.features",
      loader: () => loadFeatureAccessReadModel({ role, userId }),
      phase,
    }),
    safeBootstrapSection({
      fallback: FALLBACK_MODEL_CONFIG,
      label: "mobile.bootstrap.models",
      loader: loadModelConfigReadModel,
      phase,
    }),
    session?.user && !isStartupPhase
      ? safeBootstrapSection({
          fallback: FALLBACK_PROMPT_SNAPSHOT,
          label: "mobile.bootstrap.prompts",
          loader: () =>
            loadPromptReadModel({
              preferredLanguage,
              role: session.user.role,
            }),
          phase,
        })
      : Promise.resolve({
          data: FALLBACK_PROMPT_SNAPSHOT,
          degraded: false,
        } satisfies BootstrapSectionResult<PromptSnapshot>),
    isStartupPhase
      ? Promise.resolve({
          data: FALLBACK_TRANSLATE_SNAPSHOT,
          degraded: false,
        } satisfies BootstrapSectionResult<TranslateSnapshot>)
      : safeBootstrapSection({
          fallback: FALLBACK_TRANSLATE_SNAPSHOT,
          label: "mobile.bootstrap.translate",
          loader: () => loadTranslateReadModel({ includeLanguages: true }),
          phase,
        }),
    session?.user && !isStartupPhase
      ? safeBootstrapSection({
          fallback: FALLBACK_PRICING_SNAPSHOT,
          label: "mobile.bootstrap.pricing",
          loader: loadPricingReadModel,
          phase,
        })
      : Promise.resolve({
          data: FALLBACK_PRICING_SNAPSHOT,
          degraded: false,
        } satisfies BootstrapSectionResult<PricingSnapshot>),
    session?.user && !isStartupPhase
      ? withApiTiming("mobile.bootstrap.billing", () =>
          loadBillingReadModel(session.user.id)
        )
          .then((data) => ({ data, degraded: false }))
          .catch((error) => {
            console.error("[api/mobile/bootstrap] Failed to load billing.", error);
            return { data: null, degraded: true };
          })
      : Promise.resolve({ data: null, degraded: false }),
  ]);

  const languageSnapshot = languageSnapshotResult.data;
  const featureSnapshot = featureSnapshotResult.data;
  const modelConfig = modelConfigResult.data;
  const promptSnapshot = promptSnapshotResult.data;
  const translate = translateResult.data;
  const pricing = pricingResult.data;
  const balance = balanceResult.data;
  const degradedSections: BootstrapSection[] = [
    languageSnapshotResult.degraded ? "i18n" : null,
    featureSnapshotResult.degraded ? "features" : null,
    modelConfigResult.degraded ? "modelConfig" : null,
    promptSnapshotResult.degraded ? "prompts" : null,
    translateResult.degraded ? "translate" : null,
    pricingResult.degraded ? "pricing" : null,
    balanceResult.degraded ? "billing" : null,
  ].filter((section): section is BootstrapSection => Boolean(section));
  const deferredSections: BootstrapSection[] = isStartupPhase
    ? [
        "billing",
        languageSnapshotResult.degraded ? "i18n" : null,
        "pricing",
        "prompts",
        "translate",
      ].filter((section): section is BootstrapSection => Boolean(section))
    : [];

  const response = NextResponse.json(
    {
      meta: {
        degradedSections,
        deferredSections,
        phase,
      },
      session,
      i18n: languageSnapshot.i18n,
      featureAccess: {
        calculator: featureSnapshot.calculator,
        customKnowledge: featureSnapshot.customKnowledge,
        documentUploads: featureSnapshot.documentUploads,
        forum: featureSnapshot.forum,
        jobs: featureSnapshot.jobs,
        study: featureSnapshot.study,
        translate: featureSnapshot.translate,
      },
      modelConfig,
      chat: {
        languages: languageSnapshot.chatLanguages,
        suggestedPrompts: promptSnapshot.suggestedPrompts,
        iconPromptActions: promptSnapshot.iconPromptActions,
        imageGeneration: featureSnapshot.imageGeneration,
      },
      translate,
      billing: {
        imageGenerationEnabledForAll: pricing.imageGenerationEnabledForAll,
        recommendedPlanId: pricing.recommendedPlanId,
        balance,
        plans: pricing.plans,
      },
    },
    {
      headers: noStoreHeaders(),
    }
  );

  if (requestedLanguage) {
    response.cookies.set("lang", languageSnapshot.i18n.activeLanguage.code, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}
