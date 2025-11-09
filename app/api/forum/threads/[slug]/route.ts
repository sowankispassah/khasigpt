import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { forumDisabledResponse, forumErrorResponse } from "@/lib/forum/api-helpers";
import {
  deleteForumThread,
  getForumThreadDetail,
  updateForumThreadStatus,
} from "@/lib/forum/service";
import { isForumEnabled } from "@/lib/forum/config";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  if (!(await isForumEnabled())) {
    return forumDisabledResponse();
  }
  try {
    const session = await auth();
    const detail = await getForumThreadDetail({
      slug: params.slug,
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
  request: Request,
  { params }: { params: { slug: string } }
) {
  if (!(await isForumEnabled())) {
    return forumDisabledResponse();
  }
  try {
    const session = await auth();
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

    await updateForumThreadStatus({
      slug: params.slug,
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
  _request: Request,
  { params }: { params: { slug: string } }
) {
  if (!(await isForumEnabled())) {
    return forumDisabledResponse();
  }
  try {
    const session = await auth();
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
    await deleteForumThread({
      slug: params.slug,
      userId: session.user.id,
      isAdmin,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
