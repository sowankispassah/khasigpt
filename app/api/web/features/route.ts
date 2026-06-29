import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { CACHE_CONTROL, cacheHeaders, noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import { loadFeatureAccessReadModel } from "@/lib/api/read-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildDegradedFeatureSnapshot() {
  return {
    meta: {
      degraded: true,
      featureAccessStatus: "unavailable",
      missingFeatureKeys: [],
    },
    calculator: true,
    customKnowledge: false,
    documentUploads: true,
    forum: true,
    jobs: true,
    liveTranslationWeb: false,
    study: true,
    translate: true,
    voiceChatWeb: false,
    imageGeneration: {
      enabled: true,
      canGenerate: true,
      requiresPaidCredits: false,
    },
  };
}

export async function GET(request: Request) {
  const authContext = await getAuthenticatedUser(request, {
    allowBearer: false,
  });
  const user = authContext?.user ?? null;
  const snapshot = await withApiTiming("web.features", () =>
    loadFeatureAccessReadModel({
      role: user?.role ?? null,
      userId: user?.id ?? null,
    })
  ).catch((error) => {
    console.error(
      "[api/web/features] Failed to confirm feature access; returning render-only shell fallback.",
      error
    );
    return buildDegradedFeatureSnapshot();
  });
  const headers = snapshot.meta.degraded
    ? noStoreHeaders()
    : cacheHeaders(CACHE_CONTROL.privateShort);

  return NextResponse.json(
    {
      featureAccess: {
        calculator: snapshot.calculator,
        customKnowledge: snapshot.customKnowledge,
        documentUploads: snapshot.documentUploads,
        forum: snapshot.forum,
        jobs: snapshot.jobs,
        liveTranslation: snapshot.liveTranslationWeb,
        study: snapshot.study,
        translate: snapshot.translate,
        voiceChat: snapshot.voiceChatWeb,
      },
      imageGeneration: snapshot.imageGeneration,
      meta: snapshot.meta,
    },
    { headers }
  );
}
