import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  forumDisabledResponse,
  forumErrorResponse,
} from "@/lib/forum/api-helpers";
import { isForumEnabledForRole } from "@/lib/forum/config";
import {
  recordForumThreadView,
  resolveForumThreadId,
} from "@/lib/forum/service";
import { getMobileSession } from "@/lib/mobile-auth-session";

type ThreadViewRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: ThreadViewRouteContext
) {
  const session = await getMobileSession(request);
  if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
    return forumDisabledResponse();
  }
  try {
    const { slug } = await context.params;
    const threadId = await resolveForumThreadId(slug);

    if (!threadId) {
      return NextResponse.json(
        {
          code: "not_found:api",
          message: "Thread not found.",
        },
        { status: 404 }
      );
    }

    await recordForumThreadView(threadId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
