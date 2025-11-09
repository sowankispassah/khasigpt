import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { forumDisabledResponse, forumErrorResponse } from "@/lib/forum/api-helpers";
import { toggleForumPostReaction } from "@/lib/forum/service";
import { isForumEnabled } from "@/lib/forum/config";

const reactionSchema = z.object({
  type: z.enum(["like", "insightful", "support"]),
});

export async function POST(
  request: Request,
  { params }: { params: { postId: string } }
) {
  if (!(await isForumEnabled())) {
    return forumDisabledResponse();
  }
  const session = await auth();
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
    const payload = reactionSchema.parse(await request.json());
    const result = await toggleForumPostReaction({
      postId: params.postId,
      userId: session.user.id,
      type: payload.type,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
