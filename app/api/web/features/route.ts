import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { CACHE_CONTROL, cacheHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import { loadFeatureAccessReadModel } from "@/lib/api/read-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  );

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
      },
      imageGeneration: snapshot.imageGeneration,
    },
    { headers: cacheHeaders(CACHE_CONTROL.privateShort) }
  );
}
