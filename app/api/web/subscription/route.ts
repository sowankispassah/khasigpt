import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import { loadBillingReadModel } from "@/lib/api/read-models";
import { ChatSDKError } from "@/lib/errors";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WEB_SUBSCRIPTION_TIMEOUT_MS = 9000;

export async function GET(request: Request) {
  const authContext = await getAuthenticatedUser(request, {
    allowBearer: false,
  });
  if (!authContext?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const balance = await withApiTiming("web.subscription", () =>
    withTimeout(
      loadBillingReadModel(authContext.user.id),
      WEB_SUBSCRIPTION_TIMEOUT_MS,
      () => {
        console.error("[api/web/subscription] Balance read timed out.", {
          timeoutMs: WEB_SUBSCRIPTION_TIMEOUT_MS,
        });
      }
    )
  ).catch((error) => {
    console.error("[api/web/subscription] Balance read failed.", error);
    return null;
  });

  if (!balance) {
    return NextResponse.json(
      {
        degraded: true,
        message: "Subscription could not be loaded right now. Please retry.",
      },
      { headers: noStoreHeaders(), status: 503 }
    );
  }

  return NextResponse.json({ balance }, { headers: noStoreHeaders() });
}
