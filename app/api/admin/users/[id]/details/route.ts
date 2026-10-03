import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserDetails, getAdminUserSupportHistory } from "@/lib/db/admin-user-details";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
const querySchema = z.object({
  section: z.enum(["account", "support"]).default("account"),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id);
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!id.success || !query.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: noStore });
  try {
    const details =
      query.data.section === "support"
        ? await getAdminUserSupportHistory(id.data, query.data.offset)
        : await getAdminUserDetails(id.data);
    if (!details)
      return NextResponse.json({ error: "User not found" }, { status: 404, headers: noStore });
    return NextResponse.json({ ...details, currentAdminId: admin.id }, { headers: noStore });
  } catch (error) {
    console.error("[admin.users] Details lookup failed.", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "Unable to load user details" },
      { status: 503, headers: noStore },
    );
  }
}
