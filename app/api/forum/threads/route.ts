import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import {
  forumDisabledResponse,
  forumErrorResponse,
} from "@/lib/forum/api-helpers";
import { isForumEnabledForRole } from "@/lib/forum/config";
import { createForumThread, getForumOverview } from "@/lib/forum/service";

export const dynamic = "force-dynamic";

const createThreadSchema = z.object({
  title: z.string().min(8).max(200),
  content: z.string().min(24),
  summary: z.string().max(800).optional(),
  categorySlug: z.string().min(1),
  tagSlugs: z.array(z.string().min(1).max(64)).max(5).optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
    return forumDisabledResponse();
  }
  try {
    const url = new URL(request.url);
    const categorySlug = url.searchParams.get("category") ?? null;
    const tagSlug = url.searchParams.get("tag") ?? null;
    const search = url.searchParams.get("search") ?? null;
    const cursor = url.searchParams.get("cursor") ?? null;
    const limitParam = url.searchParams.get("limit");
    const parsedLimit = limitParam
      ? Number.parseInt(limitParam, 10)
      : undefined;
    const limit =
      typeof parsedLimit === "number" && Number.isFinite(parsedLimit)
        ? parsedLimit
        : undefined;

    const overview = await getForumOverview({
      categorySlug,
      tagSlug,
      search,
      cursor,
      limit,
      viewerUserId: session?.user?.id ?? null,
    });

    return NextResponse.json(overview);
  } catch (error) {
    return forumErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
    return forumDisabledResponse();
  }
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        code: "unauthorized:auth",
        message: "You must sign in before starting a discussion.",
      },
      { status: 401 }
    );
  }

  try {
    const payload = createThreadSchema.parse(await request.json());
    const thread = await createForumThread({
      ...payload,
      authorId: session.user.id,
    });

    return NextResponse.json(
      {
        id: thread.id,
        slug: thread.slug,
      },
      { status: 201 }
    );
  } catch (error) {
    return forumErrorResponse(error);
  }
}
