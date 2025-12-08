import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  forumDisabledResponse,
  forumErrorResponse,
} from "@/lib/forum/api-helpers";
import { isForumEnabled } from "@/lib/forum/config";
import {
  recordForumThreadView,
  resolveForumThreadId,
} from "@/lib/forum/service";

type ThreadViewRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function POST(
  _request: NextRequest,
  context: ThreadViewRouteContext
) {
  if (!(await isForumEnabled())) {
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
