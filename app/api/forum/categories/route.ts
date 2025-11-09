import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { forumDisabledResponse, forumErrorResponse } from "@/lib/forum/api-helpers";
import { createForumCategory } from "@/lib/forum/service";
import { isForumEnabled } from "@/lib/forum/config";

const createCategorySchema = z.object({
  name: z.string().min(3).max(128),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, {
      message: "Slug can only contain lowercase letters, numbers, and hyphens.",
    })
    .optional(),
  description: z.string().max(500).optional(),
  position: z.coerce.number().int().min(0).max(1000).optional(),
  isLocked: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!(await isForumEnabled())) {
    return forumDisabledResponse();
  }
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json(
      {
        code: "forbidden:auth",
        message: "Only administrators can manage categories.",
      },
      { status: 403 }
    );
  }

  try {
    const payload = createCategorySchema.parse(await request.json());
    const category = await createForumCategory(payload);
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return forumErrorResponse(error);
  }
}
