import { NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import {
  forumDisabledResponse,
  forumErrorResponse,
} from "@/lib/forum/api-helpers";
import { isForumEnabledForRole } from "@/lib/forum/config";
import { getForumOverview } from "@/lib/forum/service";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MOBILE_FORUM_READ_TIMEOUT_MS = 12_000;
const FORUM_TIMEOUT_RESPONSE = {
  code: "timeout:forum",
  message: "Unable to load forum right now. Please try again.",
};

function parseForumLimit(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  const session = await withApiTiming(
    "mobile.forum.auth",
    () => getMobileSession(request),
    { slowMs: 750 }
  );

  if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
    return forumDisabledResponse();
  }

  try {
    const url = new URL(request.url);
    const overview = await withApiTiming(
      "mobile.forum.overview",
      () =>
        withTimeout(
          getForumOverview({
            categorySlug: url.searchParams.get("category") ?? null,
            cursor: url.searchParams.get("cursor") ?? null,
            limit: parseForumLimit(url.searchParams.get("limit")),
            search: url.searchParams.get("search") ?? null,
            tagSlug: url.searchParams.get("tag") ?? null,
            viewerUserId: session?.user?.id ?? null,
          }),
          MOBILE_FORUM_READ_TIMEOUT_MS,
          () => {
            console.warn("[api/mobile/forum/threads] Forum overview timed out.");
          }
        ),
      { slowMs: 1500 }
    );

    return NextResponse.json(overview, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") {
      return NextResponse.json(FORUM_TIMEOUT_RESPONSE, {
        headers: noStoreHeaders(),
        status: 504,
      });
    }
    return forumErrorResponse(error);
  }
}
