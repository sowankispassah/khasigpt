import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createExploreCategory,
  createExploreSubcategory,
  deleteExploreCategory,
  deleteExploreSubcategory,
  listExploreCategories,
  reorderExploreItems,
  updateExploreCategory,
  updateExploreSubcategory,
} from "@/lib/explore/service";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_category"), value: z.unknown() }),
  z.object({ action: z.literal("update_category"), id: z.string().uuid(), value: z.unknown() }),
  z.object({ action: z.literal("delete_category"), id: z.string().uuid() }),
  z.object({ action: z.literal("create_subcategory"), value: z.unknown() }),
  z.object({ action: z.literal("update_subcategory"), id: z.string().uuid(), value: z.unknown() }),
  z.object({ action: z.literal("delete_subcategory"), id: z.string().uuid() }),
  z.object({
    action: z.literal("reorder"),
    kind: z.enum(["category", "subcategory"]),
    ids: z.array(z.string().uuid()).min(1).max(500),
  }),
]);

async function requireAdmin(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  return user ?? null;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json({ categories: await listExploreCategories({ admin: true }) });
  } catch (error) {
    console.error("[api/admin/explore] Read failed.", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    let result: unknown = null;
    switch (parsed.data.action) {
      case "create_category":
        result = await createExploreCategory(parsed.data.value);
        break;
      case "update_category":
        result = await updateExploreCategory(parsed.data.id, parsed.data.value);
        break;
      case "delete_category":
        result = await deleteExploreCategory(parsed.data.id);
        break;
      case "create_subcategory":
        result = await createExploreSubcategory(parsed.data.value);
        break;
      case "update_subcategory":
        result = await updateExploreSubcategory(parsed.data.id, parsed.data.value);
        break;
      case "delete_subcategory":
        result = await deleteExploreSubcategory(parsed.data.id);
        break;
      case "reorder":
        await reorderExploreItems(parsed.data.kind, parsed.data.ids);
        result = { ids: parsed.data.ids };
        break;
    }
    revalidateTag("explore-categories", "max");
    console.info("[api/admin/explore] mutation", {
      action: parsed.data.action,
      actorId: admin.id,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[api/admin/explore] Mutation failed.", error);
    const invalid = error instanceof z.ZodError;
    return NextResponse.json(
      { error: invalid ? "invalid_request" : "save_failed" },
      { status: invalid ? 400 : 500 }
    );
  }
}
