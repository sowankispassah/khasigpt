import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import {
  forumDisabledResponse,
  forumErrorResponse,
} from "@/lib/forum/api-helpers";
import { isForumEnabledForRole } from "@/lib/forum/config";
import {
  resolveForumThreadId,
  toggleForumSubscription,
} from "@/lib/forum/service";

const subscriptionSchema = z.object({
  subscribe: z.boolean(),
});

type ThreadSubscribeRouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: ThreadSubscribeRouteContext
) {
  const session = await auth();
  if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
    return forumDisabledResponse();
  }
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
    const { slug } = await context.params;
    const payload = subscriptionSchema.parse(await request.json());
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
