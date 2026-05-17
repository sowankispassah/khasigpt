import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import { loadFeatureAccessReadModel } from "@/lib/api/read-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authContext = await getAuthenticatedUser(request);
  const user = authContext?.user ?? null;
  const snapshot = await withApiTiming("mobile.features", () =>
    loadFeatureAccessReadModel({
      role: user?.role ?? null,
      userId: user?.id ?? null,
    })
  ).catch((error) => {
    console.error(
      "[api/mobile/features] Failed to confirm feature access; returning render-only shell fallback.",
      error
    );
    return {
      calculator: true,
      customKnowledge: false,
      documentUploads: true,
      forum: true,
      jobs: true,
      study: true,
      translate: true,
      voiceChat: false,
      voiceChatAndroid: false,
      voiceChatWeb: false,
      imageGeneration: {
        enabled: true,
        canGenerate: true,
        requiresPaidCredits: false,
      },
    };
  });

  return NextResponse.json(
    {
      featureAccess: {
        calculator: snapshot.calculator,
        customKnowledge: snapshot.customKnowledge,
        documentUploads: snapshot.documentUploads,
        forum: snapshot.forum,
        jobs: snapshot.jobs,
        study: snapshot.study,
        translate: snapshot.translate,
        voiceChat: snapshot.voiceChat,
        voiceChatAndroid: snapshot.voiceChatAndroid,
        voiceChatWeb: snapshot.voiceChatWeb,
      },
      imageGeneration: snapshot.imageGeneration,
    },
    { headers: noStoreHeaders() }
  );
}
