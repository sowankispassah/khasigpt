import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  forumDisabledResponse,
  forumErrorResponse,
} from "@/lib/forum/api-helpers";
import { isForumEnabledForRole } from "@/lib/forum/config";
import {
  deleteForumThread,
  getForumThreadDetail,
  updateForumThreadStatus,
} from "@/lib/forum/service";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const session = await getMobileSession(request);
  if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
    return forumDisabledResponse();
  }
  try {
    const { slug } = await context.params;
    const detail = await getForumThreadDetail({
      slug,
      viewerUserId: session?.user?.id ?? null,
    });

    if (!detail) {
      return NextResponse.json(
        {
          code: "not_found:api",
          message: "Thread not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(detail);
  } catch (error) {
    return forumErrorResponse(error);
  }
}

const updateThreadSchema = z.object({
  action: z.enum(["resolve", "reopen"]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getMobileSession(request);
    if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
      return forumDisabledResponse();
    }
    if (!session?.user) {
      return NextResponse.json(
        {
          code: "unauthorized:auth",
          message: "You must sign in to update a thread.",
        },
        { status: 401 }
      );
    }

    const payload = updateThreadSchema.parse(await request.json());
    const status = payload.action === "resolve" ? "resolved" : "open";
    const isAdmin = session.user.role === "admin";
    const { slug } = await context.params;

    await updateForumThreadStatus({
      slug,
      userId: session.user.id,
      isAdmin,
      status,
    });

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return forumErrorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getMobileSession(request);
    if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
      return forumDisabledResponse();
    }
    if (!session?.user) {
      return NextResponse.json(
        {
          code: "unauthorized:auth",
          message: "You must sign in to delete a thread.",
        },
        { status: 401 }
      );
    }
    const isAdmin = session.user.role === "admin";
    const { slug } = await context.params;
    await deleteForumThread({
      slug,
      userId: session.user.id,
      isAdmin,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
