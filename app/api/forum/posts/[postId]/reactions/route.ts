import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  forumDisabledResponse,
  forumErrorResponse,
  forumWriteRateLimitResponse,
} from "@/lib/forum/api-helpers";
import { isForumEnabledForRole } from "@/lib/forum/config";
import { toggleForumPostReaction } from "@/lib/forum/service";
import { getMobileSession } from "@/lib/mobile-auth-session";

const reactionSchema = z.object({
  type: z.enum(["like", "insightful", "support"]),
});

type PostRouteContext = {
  params: Promise<{
    postId: string;
  }>;
};

export async function POST(request: NextRequest, context: PostRouteContext) {
  const session = await getMobileSession(request);
  if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
    return forumDisabledResponse();
  }
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        code: "unauthorized:auth",
        message: "Sign in to react to posts.",
      },
      { status: 401 }
    );
  }

  try {
    const { postId } = await context.params;
    const payload = reactionSchema.parse(await request.json());
    const limited = await forumWriteRateLimitResponse(
      session.user.id,
      "reaction"
    );
    if (limited) {
      return limited;
    }
    const result = await toggleForumPostReaction({
      postId,
      userId: session.user.id,
      type: payload.type,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
