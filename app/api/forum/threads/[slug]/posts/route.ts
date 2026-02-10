import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import {
  forumDisabledResponse,
  forumErrorResponse,
} from "@/lib/forum/api-helpers";
import { isForumEnabledForRole } from "@/lib/forum/config";
import { createForumPost } from "@/lib/forum/service";

const createPostSchema = z.object({
  content: z.string().min(8),
  parentPostId: z.string().uuid().optional(),
});

type ThreadPostRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: ThreadPostRouteContext
) {
  const session = await auth();
  if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
    return forumDisabledResponse();
  }
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
    const { slug } = await context.params;
    const payload = createPostSchema.parse(await request.json());
    const post = await createForumPost({
      threadSlug: slug,
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
