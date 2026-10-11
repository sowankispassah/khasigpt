import { NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import {
  forumErrorResponse,
} from "@/lib/forum/api-helpers";
import { getForumOverview } from "@/lib/forum/service";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPTIONAL_MOBILE_FORUM_AUTH_TIMEOUT_MS = 750;

function parseForumLimit(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  try {
    const session = await withApiTiming(
      "mobile.forum.auth",
      () =>
        getMobileSession(request, {
          bearerTimeoutMs: OPTIONAL_MOBILE_FORUM_AUTH_TIMEOUT_MS,
          cookieTimeoutMs: OPTIONAL_MOBILE_FORUM_AUTH_TIMEOUT_MS,
        }).catch((error) => {
          console.warn(
            "[api/mobile/forum/threads] Optional session lookup failed; continuing anonymous forum read.",
            error
          );
          return null;
        }),
      { slowMs: 750 }
    );
    const url = new URL(request.url);
    const overview = await withApiTiming(
      "mobile.forum.overview",
      () =>
        getForumOverview({
          categorySlug: url.searchParams.get("category") ?? null,
          cursor: url.searchParams.get("cursor") ?? null,
          limit: parseForumLimit(url.searchParams.get("limit")),
          search: url.searchParams.get("search") ?? null,
          tagSlug: url.searchParams.get("tag") ?? null,
          viewerUserId: session?.user?.id ?? null,
        }),
      { slowMs: 1500 }
    );

    return NextResponse.json(overview, { headers: noStoreHeaders() });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
