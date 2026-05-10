import { NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import {
  forumErrorResponse,
} from "@/lib/forum/api-helpers";
import { getForumThreadDetail } from "@/lib/forum/service";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MOBILE_FORUM_READ_TIMEOUT_MS = 12_000;
const OPTIONAL_MOBILE_FORUM_AUTH_TIMEOUT_MS = 500;

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const session = await withApiTiming(
    "mobile.forum.thread.auth",
    () =>
      getMobileSession(request, {
        cookieTimeoutMs: OPTIONAL_MOBILE_FORUM_AUTH_TIMEOUT_MS,
      }),
    { slowMs: 750 }
  );

  try {
    const { slug } = await context.params;
    const detail = await withApiTiming(
      "mobile.forum.thread.detail",
      () =>
        withTimeout(
          getForumThreadDetail({
            slug,
            viewerUserId: session?.user?.id ?? null,
          }),
          MOBILE_FORUM_READ_TIMEOUT_MS,
          () => {
            console.warn("[api/mobile/forum/thread] Detail timed out.", {
              slug,
            });
          }
        ),
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
    if (error instanceof Error && error.message === "timeout") {
      return NextResponse.json(
        {
          code: "timeout:forum",
          message: "Unable to load this discussion right now. Please try again.",
        },
        { headers: noStoreHeaders(), status: 504 }
      );
    }
    return forumErrorResponse(error);
  }
}
