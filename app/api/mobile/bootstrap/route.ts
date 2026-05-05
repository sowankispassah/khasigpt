import { cookies } from "next/headers";
import { NextResponse } from "next/server";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await withApiTiming(
    "mobile.bootstrap.auth",
    () => getMobileSession(request),
    { slowMs: 750 }
  );
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
    languageSnapshot,
    featureSnapshot,
    modelConfig,
    promptSnapshot,
    translate,
    pricing,
    balance,
  ] = await Promise.all([
    withApiTiming("mobile.bootstrap.languages", () =>
      loadLanguageReadModel(preferredLanguage)
    ),
    withApiTiming("mobile.bootstrap.features", () =>
      loadFeatureAccessReadModel({ role, userId })
    ),
    withApiTiming("mobile.bootstrap.models", loadModelConfigReadModel),
    session?.user && !isStartupPhase
      ? withApiTiming("mobile.bootstrap.prompts", () =>
          loadPromptReadModel({
            preferredLanguage,
            role: session.user.role,
          })
        )
      : Promise.resolve({ iconPromptActions: [], suggestedPrompts: [] }),
    withApiTiming("mobile.bootstrap.translate", () =>
      loadTranslateReadModel({ includeLanguages: !isStartupPhase })
    ),
    session?.user && !isStartupPhase
      ? withApiTiming("mobile.bootstrap.pricing", loadPricingReadModel)
      : Promise.resolve({
          imageGenerationEnabledForAll: false,
          recommendedPlanId: null,
          plans: [],
        }),
    session?.user && !isStartupPhase
      ? withApiTiming("mobile.bootstrap.billing", () =>
          loadBillingReadModel(session.user.id)
        ).catch((error) => {
          console.error("[api/mobile/bootstrap] Failed to load billing.", error);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const response = NextResponse.json(
    {
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
