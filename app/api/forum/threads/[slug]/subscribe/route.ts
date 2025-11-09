import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { forumDisabledResponse, forumErrorResponse } from "@/lib/forum/api-helpers";
import {
  resolveForumThreadId,
  toggleForumSubscription,
} from "@/lib/forum/service";
import { isForumEnabled } from "@/lib/forum/config";

const subscriptionSchema = z.object({
  subscribe: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  if (!(await isForumEnabled())) {
    return forumDisabledResponse();
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        code: "unauthorized:auth",
        message: "Sign in to manage thread notifications.",
      },
      { status: 401 }
    );
  }

  try {
    const payload = subscriptionSchema.parse(await request.json());
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

    await toggleForumSubscription({
      threadId,
      userId: session.user.id,
      subscribe: payload.subscribe,
    });

    return NextResponse.json(
      { subscribed: payload.subscribe },
      { status: 200 }
    );
  } catch (error) {
    return forumErrorResponse(error);
  }
}
