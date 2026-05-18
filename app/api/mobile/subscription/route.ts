import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import { loadBillingReadModel } from "@/lib/api/read-models";
import { ChatSDKError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authContext = await getAuthenticatedUser(request);
  if (!authContext?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const balance = await withApiTiming("mobile.subscription", () =>
    loadBillingReadModel(authContext.user.id)
  );

  return NextResponse.json({ balance }, { headers: noStoreHeaders() });
}
