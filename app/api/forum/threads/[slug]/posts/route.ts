import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { forumDisabledResponse, forumErrorResponse } from "@/lib/forum/api-helpers";
import { createForumPost } from "@/lib/forum/service";
import { isForumEnabled } from "@/lib/forum/config";

const createPostSchema = z.object({
  content: z.string().min(8),
  parentPostId: z.string().uuid().optional(),
});

type ThreadPostRouteContext = {
  params: {
    slug: string;
  };
};

export async function POST(
  request: NextRequest,
  context: ThreadPostRouteContext
) {
  if (!(await isForumEnabled())) {
    return forumDisabledResponse();
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        code: "unauthorized:auth",
        message: "You must sign in before replying.",
      },
      { status: 401 }
    );
  }

  try {
    const payload = createPostSchema.parse(await request.json());
    const post = await createForumPost({
      threadSlug: context.params.slug,
      authorId: session.user.id,
      content: payload.content,
      parentPostId: payload.parentPostId ?? null,
    });

    return NextResponse.json(
      {
        id: post.id,
        threadId: post.threadId,
      },
      { status: 201 }
    );
  } catch (error) {
    return forumErrorResponse(error);
  }
}
