import { NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import {
  forumErrorResponse,
} from "@/lib/forum/api-helpers";
import { getForumThreadDetail } from "@/lib/forum/service";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPTIONAL_MOBILE_FORUM_AUTH_TIMEOUT_MS = 750;

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const session = await withApiTiming(
    "mobile.forum.thread.auth",
    () =>
      getMobileSession(request, {
        bearerTimeoutMs: OPTIONAL_MOBILE_FORUM_AUTH_TIMEOUT_MS,
        cookieTimeoutMs: OPTIONAL_MOBILE_FORUM_AUTH_TIMEOUT_MS,
      }).catch((error) => {
        console.warn(
          "[api/mobile/forum/thread] Optional session lookup failed; continuing anonymous forum read.",
          error
        );
        return null;
      }),
    { slowMs: 750 }
  );

  try {
    const { slug } = await context.params;
    const detail = await withApiTiming(
      "mobile.forum.thread.detail",
      () =>
        getForumThreadDetail({
          slug,
          viewerUserId: session?.user?.id ?? null,
        }),
      { slowMs: 1500 }
    );

    if (!detail) {
      return NextResponse.json(
        {
          code: "not_found:api",
          message: "Thread not found.",
        },
        { headers: noStoreHeaders(), status: 404 }
      );
    }

    return NextResponse.json(detail, { headers: noStoreHeaders() });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
