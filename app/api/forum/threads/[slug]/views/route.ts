import { NextResponse } from "next/server";

import { forumDisabledResponse, forumErrorResponse } from "@/lib/forum/api-helpers";
import {
  recordForumThreadView,
  resolveForumThreadId,
} from "@/lib/forum/service";
import { isForumEnabled } from "@/lib/forum/config";

export async function POST(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  if (!(await isForumEnabled())) {
    return forumDisabledResponse();
  }
  try {
    const threadId = await resolveForumThreadId(params.slug);

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
